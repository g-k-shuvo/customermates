/**
 * `runMigration` against an in-memory workspace.
 *
 * The fake client owns records and custom columns; the fake writer records every
 * call and applies it to that workspace, so a test can assert both the payload
 * that was sent and the reconciliation report the run produced. Nothing here
 * talks HTTP, and nothing needs a Pipedrive account.
 */

import type { MigrationConfig } from "../config";
import type {
  CrmCustomColumn,
  CrmLostReason,
  CrmPipeline,
  CrmReads,
  CrmRecord,
  CrmService,
  CrmStage,
  CrmUser,
} from "../crm-client";
import type { CrmWrites, CustomColumnInput } from "../crm-writes";
import type { PipedriveSource } from "../pipedrive-source";
import type {
  PipedriveActivity,
  PipedriveDeal,
  PipedriveDealField,
  PipedriveFlowEntry,
  PipedriveNote,
  PipedriveOrganization,
  PipedrivePerson,
  PipedrivePipeline,
  PipedriveStage,
  PipedriveUser,
} from "../pipedrive.types";
import type { EntityLine, MigrationEntity, ReconciliationReport } from "../reconciliation";

import { describe, expect, it } from "vitest";

import { Currency, CustomColumnType, EntityType } from "@/generated/prisma";

import {
  PIPEDRIVE_ADDRESS_COLUMN,
  PIPEDRIVE_CLOSED_AT_COLUMN,
  PIPEDRIVE_CURRENCY_COLUMN,
  PIPEDRIVE_ID_COLUMN,
  PIPEDRIVE_NOTE_IDS_COLUMN,
  PIPEDRIVE_PHONE_COLUMN,
  PIPEDRIVE_VALUE_COLUMN,
} from "../mapping";
import { runMigration } from "../run-migration";

type WriteCall =
  | {
      kind: "createRecord";
      entityPath: string;
      payload: Record<string, unknown>;
    }
  | {
      kind: "updateRecord";
      entityPath: string;
      id: string;
      payload: Record<string, unknown>;
    }
  | { kind: "createPipeline"; payload: Record<string, unknown> }
  | {
      kind: "createStage";
      pipelineId: string;
      payload: Record<string, unknown>;
    }
  | { kind: "createLostReason"; payload: Record<string, unknown> }
  | { kind: "createService"; payload: Record<string, unknown> }
  | { kind: "createCustomColumn"; input: CustomColumnInput }
  | { kind: "markDealWon"; id: string }
  | { kind: "markDealLost"; id: string; lostReasonId: string }
  | { kind: "reopenDeal"; id: string };

type SourceData = {
  users?: PipedriveUser[];
  organizations?: PipedriveOrganization[];
  persons?: PipedrivePerson[];
  pipelines?: PipedrivePipeline[];
  stages?: PipedriveStage[];
  dealFields?: PipedriveDealField[];
  deals?: PipedriveDeal[];
  dealFlow?: Record<number, PipedriveFlowEntry[]>;
  activities?: PipedriveActivity[];
  notes?: PipedriveNote[];
};

const ENTITY_PATHS = ["organizations", "contacts", "deals", "tasks"] as const;

const COLUMN_LABELS: Record<(typeof ENTITY_PATHS)[number], string[]> = {
  organizations: [PIPEDRIVE_ID_COLUMN, PIPEDRIVE_ADDRESS_COLUMN, PIPEDRIVE_NOTE_IDS_COLUMN],
  contacts: [PIPEDRIVE_ID_COLUMN, PIPEDRIVE_PHONE_COLUMN, PIPEDRIVE_NOTE_IDS_COLUMN],
  deals: [
    PIPEDRIVE_ID_COLUMN,
    PIPEDRIVE_VALUE_COLUMN,
    PIPEDRIVE_CURRENCY_COLUMN,
    PIPEDRIVE_CLOSED_AT_COLUMN,
    PIPEDRIVE_NOTE_IDS_COLUMN,
  ],
  tasks: [PIPEDRIVE_ID_COLUMN],
};

const ENTITY_TYPES: Record<(typeof ENTITY_PATHS)[number], EntityType> = {
  organizations: EntityType.organization,
  contacts: EntityType.contact,
  deals: EntityType.deal,
  tasks: EntityType.task,
};

class FakeWorkspace {
  readonly calls: WriteCall[] = [];
  readonly users: CrmUser[] = [
    {
      id: "user-ada",
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
    },
  ];
  readonly records: Record<string, CrmRecord[]> = {
    organizations: [],
    contacts: [],
    deals: [],
    tasks: [],
  };
  readonly columns: Record<string, CrmCustomColumn[]> = {
    organizations: [],
    contacts: [],
    deals: [],
    tasks: [],
  };
  readonly pipelines: CrmPipeline[] = [];
  readonly lostReasons: CrmLostReason[] = [];
  readonly services: CrmService[] = [];

  private sequence = 0;

  private nextId(prefix: string): string {
    this.sequence += 1;

    return `${prefix}-${this.sequence}`;
  }

  /** Provisions the `pipedrive_*` columns a previous run would have left behind. */
  provisionBookkeepingColumns(): this {
    for (const entityPath of ENTITY_PATHS)
      for (const label of COLUMN_LABELS[entityPath]) this.addColumn(entityPath, label);

    return this;
  }

  addColumn(entityPath: string, label: string): CrmCustomColumn {
    const existing = this.columns[entityPath].find((column) => column.label === label);
    if (existing) return existing;

    const column: CrmCustomColumn = {
      id: `${entityPath}.${label}`,
      label,
      type: CustomColumnType.plain,
      entityType: ENTITY_TYPES[entityPath as (typeof ENTITY_PATHS)[number]],
    };

    this.columns[entityPath].push(column);

    return column;
  }

  columnId(entityPath: string, label: string): string {
    return `${entityPath}.${label}`;
  }

  addRecord(entityPath: string, record: Omit<CrmRecord, "id"> & { id?: string }): CrmRecord {
    const stored: CrmRecord = {
      ...record,
      id: record.id ?? this.nextId(entityPath),
    };
    this.records[entityPath].push(stored);

    return stored;
  }

  addPipeline(pipeline: { name: string; position?: number; stages: CrmStage[] }): CrmPipeline {
    const stored: CrmPipeline = {
      id: this.nextId("pipeline"),
      name: pipeline.name,
      position: pipeline.position ?? this.pipelines.length,
      stages: pipeline.stages,
    };

    this.pipelines.push(stored);

    return stored;
  }

  get reads(): CrmReads {
    return {
      users: () => Promise.resolve([...this.users]),
      pipelines: () =>
        Promise.resolve(
          this.pipelines.map((pipeline) => ({
            ...pipeline,
            stages: [...pipeline.stages],
          })),
        ),
      lostReasons: () => Promise.resolve([...this.lostReasons]),
      services: () => Promise.resolve([...this.services]),
      customColumns: (entityPath) => Promise.resolve([...(this.columns[entityPath] ?? [])]),
      searchAll: <T>(entityPath: string, filters: unknown[] = []) => {
        const field = (filters[0] as { field?: string } | undefined)?.field;
        const records = this.records[entityPath] ?? [];
        const matched =
          field === undefined
            ? records
            : records.filter((record) =>
                record.customFieldValues.some((value) => value.columnId === field && value.value !== null),
              );

        return Promise.resolve(matched as unknown as T[]);
      },
    };
  }

  get writes(): CrmWrites {
    return {
      dryRun: false,
      createRecord: (entityPath, payload) => {
        this.calls.push({ kind: "createRecord", entityPath, payload });
        const record = this.addRecord(entityPath, {
          ...(typeof payload.name === "string" ? { name: payload.name } : {}),
          ...(entityPath === "deals" ? { status: "open" } : {}),
          ...(typeof payload.stageId === "string" ? { stageId: payload.stageId } : {}),
          customFieldValues: (payload.customFieldValues as CrmRecord["customFieldValues"] | undefined) ?? [],
        });

        return Promise.resolve(record);
      },
      updateRecord: (entityPath, id, payload) => {
        this.calls.push({ kind: "updateRecord", entityPath, id, payload });
        const record = this.records[entityPath].find((candidate) => candidate.id === id);
        if (!record) return Promise.reject(new Error(`no ${entityPath} ${id}`));

        if (typeof payload.stageId === "string") record.stageId = payload.stageId;
        if (payload.notes !== undefined) record.notes = payload.notes;

        return Promise.resolve(record);
      },
      createPipeline: (payload) => {
        this.calls.push({ kind: "createPipeline", payload });
        const stages = (
          (payload.stages as { name: string; probability: number; kind: string }[] | undefined) ?? []
        ).map(
          (stage, index): CrmStage => ({
            id: this.nextId("stage"),
            name: stage.name,
            position: index,
            kind: stage.kind,
          }),
        );

        return Promise.resolve(this.addPipeline({ name: String(payload.name ?? ""), stages }));
      },
      createStage: (pipelineId, payload) => {
        this.calls.push({ kind: "createStage", pipelineId, payload });
        const stage: CrmStage = {
          id: this.nextId("stage"),
          name: String(payload.name ?? ""),
          position: Number(payload.position ?? 0),
          kind: String(payload.kind ?? "open"),
        };

        this.pipelines.find((pipeline) => pipeline.id === pipelineId)?.stages.push(stage);

        return Promise.resolve(stage);
      },
      createLostReason: (payload) => {
        this.calls.push({ kind: "createLostReason", payload });
        const reason: CrmLostReason = {
          id: this.nextId("lost-reason"),
          name: String(payload.name ?? ""),
          position: Number(payload.position ?? 0),
        };

        this.lostReasons.push(reason);

        return Promise.resolve(reason);
      },
      createService: (payload) => {
        this.calls.push({ kind: "createService", payload });
        const service: CrmService = {
          id: this.nextId("service"),
          name: String(payload.name ?? ""),
          amount: Number(payload.amount ?? 0),
        };

        this.services.push(service);

        return Promise.resolve(service);
      },
      createCustomColumn: (input) => {
        this.calls.push({ kind: "createCustomColumn", input });
        const entityPath = ENTITY_PATHS.find((path) => ENTITY_TYPES[path] === input.entityType);
        if (entityPath) this.addColumn(entityPath, input.label);

        return Promise.resolve();
      },
      markDealWon: (id) => {
        this.calls.push({ kind: "markDealWon", id });
        const record = this.records.deals.find((candidate) => candidate.id === id);
        if (record) record.status = "won";

        return Promise.resolve();
      },
      markDealLost: (id, payload) => {
        this.calls.push({
          kind: "markDealLost",
          id,
          lostReasonId: payload.lostReasonId,
        });
        const record = this.records.deals.find((candidate) => candidate.id === id);
        if (record) record.status = "lost";

        return Promise.resolve();
      },
      reopenDeal: (id) => {
        this.calls.push({ kind: "reopenDeal", id });
        const record = this.records.deals.find((candidate) => candidate.id === id);
        if (record) record.status = "open";

        return Promise.resolve();
      },
    };
  }
}

function fakeSource(data: SourceData): PipedriveSource {
  return {
    users: () => Promise.resolve(data.users ?? []),
    organizations: () => Promise.resolve(data.organizations ?? []),
    persons: () => Promise.resolve(data.persons ?? []),
    pipelines: () => Promise.resolve(data.pipelines ?? []),
    stages: () => Promise.resolve(data.stages ?? []),
    dealFields: () => Promise.resolve(data.dealFields ?? []),
    deals: () => Promise.resolve(data.deals ?? []),
    dealFlow: (dealId) => Promise.resolve(data.dealFlow?.[dealId] ?? []),
    activities: () => Promise.resolve(data.activities ?? []),
    notes: () => Promise.resolve(data.notes ?? []),
  };
}

function config(overrides: Partial<MigrationConfig> = {}): MigrationConfig {
  return {
    dryRun: false,
    baseUrl: "http://localhost:4000",
    apiKey: "test-key",
    source: { kind: "directory", path: "./export" },
    fallbackOwnerEmail: null,
    defaultCurrency: Currency.eur,
    wonStageName: "Won",
    lostStageName: "Lost",
    makeFirstPipelineDefault: false,
    only: null,
    limit: null,
    reportPath: null,
    provisionColumns: true,
    updateExisting: false,
    ...overrides,
  };
}

async function migrate(args: {
  world: FakeWorkspace;
  source: SourceData;
  config?: Partial<MigrationConfig>;
}): Promise<ReconciliationReport> {
  return await runMigration({
    config: config(args.config),
    client: args.world.reads,
    writes: args.world.writes,
    source: fakeSource(args.source),
    log: () => undefined,
  });
}

function line(report: ReconciliationReport, entity: MigrationEntity): EntityLine | undefined {
  return report.entities.find((candidate) => candidate.entity === entity);
}

function reported(report: ReconciliationReport, kind: string): string[] {
  return report.unmapped.filter((entry) => entry.kind === kind).map((entry) => entry.value);
}

const PIPEDRIVE_USERS: PipedriveUser[] = [{ id: 1, name: "Ada Lovelace", email: "ada@example.com" }];

const ONE_PIPELINE: Pick<SourceData, "users" | "pipelines" | "stages"> = {
  users: PIPEDRIVE_USERS,
  pipelines: [{ id: 1, name: "Sales", order_nr: 1 }],
  stages: [{ id: 10, name: "Discovery", order_nr: 1, pipeline_id: 1 }],
};

describe("deal closing transitions", () => {
  const lostDealWithNoReason: PipedriveDeal = {
    id: 100,
    title: "Unwinnable",
    status: "lost",
    pipeline_id: 1,
    stage_id: 10,
    user_id: 1,
  };

  it("counts a deal whose closing transition could not be made once, not twice", async () => {
    const world = new FakeWorkspace();

    const report = await migrate({
      world,
      source: {
        ...ONE_PIPELINE,
        deals: [
          {
            id: 99,
            title: "Live one",
            status: "open",
            pipeline_id: 1,
            stage_id: 10,
            user_id: 1,
          },
          lostDealWithNoReason,
        ],
      },
    });

    expect(line(report, "deals")).toMatchObject({
      sourceCount: 2,
      targetCount: 2,
      skipped: 0,
      reconciled: true,
    });
    expect(report.skipped).toEqual([]);
    expect(report.reconciled).toBe(true);
  });

  it("reports the transition it could not make as an unmapped value", async () => {
    const world = new FakeWorkspace();

    const report = await migrate({
      world,
      source: { ...ONE_PIPELINE, deals: [lostDealWithNoReason] },
    });

    expect(reported(report, "deal.closing_transition")).toEqual(["lost deal has no lost reason to map"]);
  });

  it("still writes the deal that could not be closed", async () => {
    const world = new FakeWorkspace();

    await migrate({
      world,
      source: { ...ONE_PIPELINE, deals: [lostDealWithNoReason] },
    });

    expect(world.calls.filter((call) => call.kind === "createRecord" && call.entityPath === "deals")).toHaveLength(1);
  });

  it("closes a lost deal whose reason does map", async () => {
    const world = new FakeWorkspace();

    const report = await migrate({
      world,
      source: {
        ...ONE_PIPELINE,
        deals: [{ ...lostDealWithNoReason, lost_reason: "Budget" }],
      },
    });

    expect(world.calls.some((call) => call.kind === "markDealLost")).toBe(true);
    expect(report.reconciled).toBe(true);
  });
});

describe("--only", () => {
  it("does not report an entity the run was told to skip", async () => {
    const world = new FakeWorkspace().provisionBookkeepingColumns();

    for (const entityPath of ["organizations", "contacts", "tasks"] as const) {
      for (const pipedriveId of ["1", "2"]) {
        world.addRecord(entityPath, {
          name: `existing ${pipedriveId}`,
          customFieldValues: [
            {
              columnId: world.columnId(entityPath, PIPEDRIVE_ID_COLUMN),
              value: pipedriveId,
            },
          ],
        });
      }
    }

    const report = await migrate({
      world,
      config: { only: ["deals"] },
      source: {
        ...ONE_PIPELINE,
        organizations: [
          { id: 1, name: "Acme" },
          { id: 2, name: "Globex" },
        ],
        persons: [
          { id: 1, name: "Ada" },
          { id: 2, name: "Grace" },
        ],
        activities: [
          { id: 1, subject: "Call" },
          { id: 2, subject: "Meet" },
        ],
        deals: [
          {
            id: 100,
            title: "Renewal",
            status: "open",
            pipeline_id: 1,
            stage_id: 10,
            user_id: 1,
          },
        ],
      },
    });

    expect(report.entities.map((entry) => entry.entity)).not.toContain("organizations");
    expect(report.entities.map((entry) => entry.entity)).not.toContain("contacts");
    expect(report.entities.map((entry) => entry.entity)).not.toContain("tasks");
    expect(report.reconciled).toBe(true);
  });

  it("still reports the entities it did run", async () => {
    const world = new FakeWorkspace();

    const report = await migrate({
      world,
      config: { only: ["organizations"] },
      source: {
        users: PIPEDRIVE_USERS,
        organizations: [{ id: 1, name: "Acme", owner_id: 1 }],
      },
    });

    expect(line(report, "organizations")).toMatchObject({
      sourceCount: 1,
      targetCount: 1,
      reconciled: true,
    });
  });
});

describe("stages appended to a pipeline that already exists", () => {
  const source: SourceData = {
    users: PIPEDRIVE_USERS,
    pipelines: [{ id: 1, name: "Sales", order_nr: 1 }],
    stages: [
      { id: 30, name: "Negotiation", order_nr: 3, pipeline_id: 1 },
      { id: 10, name: "Discovery", order_nr: 1, pipeline_id: 1 },
      { id: 20, name: "Proposal", order_nr: 2, pipeline_id: 1 },
    ],
  };

  const existingPipeline = (world: FakeWorkspace) =>
    world.addPipeline({
      name: "Sales",
      stages: [{ id: "stage-existing", name: "Inbox", position: 4, kind: "open" }],
    });

  it("creates them in order_nr order, not export-file order", async () => {
    const world = new FakeWorkspace();
    existingPipeline(world);

    await migrate({ world, source });

    const created = world.calls.flatMap((call) => (call.kind === "createStage" ? [call.payload] : []));

    expect(created.map((payload) => payload.name)).toEqual(["Discovery", "Proposal", "Negotiation", "Won", "Lost"]);
  });

  it("appends after the highest existing position instead of colliding with it", async () => {
    const world = new FakeWorkspace();
    existingPipeline(world);

    await migrate({ world, source });

    const created = world.calls.flatMap((call) => (call.kind === "createStage" ? [call.payload] : []));

    expect(created.map((payload) => payload.position)).toEqual([5, 6, 7, 8, 9]);
  });

  it("gives the existing pipeline the terminal won and lost pair", async () => {
    const world = new FakeWorkspace();
    const pipeline = existingPipeline(world);

    await migrate({ world, source });

    expect(pipeline.stages.filter((stage) => stage.kind === "won")).toHaveLength(1);
    expect(pipeline.stages.filter((stage) => stage.kind === "lost")).toHaveLength(1);
  });

  it("leaves a pipeline that already has terminal stages alone", async () => {
    const world = new FakeWorkspace();
    world.addPipeline({
      name: "Sales",
      stages: [
        { id: "stage-existing", name: "Inbox", position: 0, kind: "open" },
        { id: "stage-won", name: "Closed Won", position: 1, kind: "won" },
        { id: "stage-lost", name: "Closed Lost", position: 2, kind: "lost" },
      ],
    });

    await migrate({ world, source });

    const created = world.calls.flatMap((call) => (call.kind === "createStage" ? [call.payload] : []));

    expect(created.map((payload) => payload.name)).toEqual(["Discovery", "Proposal", "Negotiation"]);
  });

  it("reconciles the stages it appended", async () => {
    const world = new FakeWorkspace();
    existingPipeline(world);

    const report = await migrate({ world, source });

    expect(line(report, "stages")).toMatchObject({
      sourceCount: 3,
      targetCount: 3,
      reconciled: true,
    });
  });
});

describe("--update-existing", () => {
  const openStage: CrmStage = {
    id: "stage-open",
    name: "Discovery",
    position: 0,
    kind: "open",
  };

  function workspaceWithDeal(status: string): FakeWorkspace {
    const world = new FakeWorkspace().provisionBookkeepingColumns();

    world.addPipeline({
      name: "Sales",
      stages: [
        openStage,
        { id: "stage-won", name: "Won", position: 1, kind: "won" },
        { id: "stage-lost", name: "Lost", position: 2, kind: "lost" },
      ],
    });

    world.addRecord("deals", {
      id: "deal-existing",
      name: "Renewal",
      status,
      stageId: status === "won" ? "stage-won" : openStage.id,
      customFieldValues: [
        {
          columnId: world.columnId("deals", PIPEDRIVE_ID_COLUMN),
          value: "100",
        },
      ],
    });

    return world;
  }

  const wonDeal: PipedriveDeal = { id: 100, title: "Renewal", status: "won", pipeline_id: 1, stage_id: 10, user_id: 1 };
  const source: SourceData = { ...ONE_PIPELINE, deals: [wonDeal] };

  it("does not move a deal that is already won back to an open stage", async () => {
    const world = workspaceWithDeal("won");

    await migrate({ world, source, config: { updateExisting: true } });

    const update = world.calls.find((call) => call.kind === "updateRecord" && call.entityPath === "deals");

    expect(update).toBeDefined();
    expect(update && "payload" in update ? update.payload : {}).not.toHaveProperty("stageId");
    expect(world.records.deals[0].stageId).toBe("stage-won");
  });

  it("still restages a deal that is open on the target", async () => {
    const world = workspaceWithDeal("open");

    await migrate({
      world,
      source: { ...source, deals: [{ ...wonDeal, status: "open" }] },
      config: { updateExisting: true },
    });

    const update = world.calls.find((call) => call.kind === "updateRecord" && call.entityPath === "deals");

    expect(update && "payload" in update ? update.payload : {}).toHaveProperty("stageId");
  });

  it("closes an open target deal that is won at the source", async () => {
    const world = workspaceWithDeal("open");

    await migrate({ world, source, config: { updateExisting: true } });

    expect(world.calls.some((call) => call.kind === "markDealWon")).toBe(true);
  });
});

describe("activities", () => {
  const activity: PipedriveActivity = {
    id: 200,
    subject: "Call Ada",
    type: "call",
    due_date: "2024-04-01",
    due_time: "09:30",
    duration: "00:45",
    done: true,
    user_id: 1,
  };

  it("maps the activity type, due date and duration onto the task", async () => {
    const world = new FakeWorkspace();

    await migrate({
      world,
      source: { users: PIPEDRIVE_USERS, activities: [activity] },
    });

    const created = world.calls.find((call) => call.kind === "createRecord" && call.entityPath === "tasks");

    expect(created && "payload" in created ? created.payload : {}).toMatchObject({
      name: "Call Ada",
      activityKind: "call",
      dueAt: "2024-04-01T09:30:00.000Z",
      durationMinutes: 45,
    });
  });

  it("no longer stringifies the type and due date into the notes", async () => {
    const world = new FakeWorkspace();

    await migrate({
      world,
      source: { users: PIPEDRIVE_USERS, activities: [activity] },
    });

    const created = world.calls.find((call) => call.kind === "createRecord" && call.entityPath === "tasks");
    const notes = created && "payload" in created ? String(created.payload.notes ?? "") : "";

    expect(notes).not.toContain("Pipedrive activity type");
    expect(notes).not.toContain("Due:");
  });

  it("keeps completion in the notes and reports it, because it has no write path", async () => {
    const world = new FakeWorkspace();

    const report = await migrate({
      world,
      source: { users: PIPEDRIVE_USERS, activities: [activity] },
    });

    const created = world.calls.find((call) => call.kind === "createRecord" && call.entityPath === "tasks");
    const notes = created && "payload" in created ? String(created.payload.notes ?? "") : "";

    expect(notes).toContain("Completed in Pipedrive: yes");
    expect(reported(report, "activity.done")).toEqual(["true"]);
  });

  it("no longer reports a default activity type as unmapped", async () => {
    const world = new FakeWorkspace();

    const report = await migrate({
      world,
      source: { users: PIPEDRIVE_USERS, activities: [activity] },
    });

    expect(reported(report, "activity.type")).toEqual([]);
  });

  it("reports a customised activity type and keeps it in the notes", async () => {
    const world = new FakeWorkspace();

    const report = await migrate({
      world,
      source: {
        users: PIPEDRIVE_USERS,
        activities: [{ id: 201, subject: "Site visit", type: "site_visit" }],
      },
    });

    const created = world.calls.find((call) => call.kind === "createRecord" && call.entityPath === "tasks");
    const payload = created && "payload" in created ? created.payload : {};

    expect(payload).not.toHaveProperty("activityKind");
    expect(String(payload.notes ?? "")).toContain("Pipedrive activity type: site_visit");
    expect(reported(report, "activity.type")).toEqual(["site_visit"]);
  });
});

describe("notes", () => {
  const note: PipedriveNote = {
    id: 300,
    content: "<p>Signed</p>",
    org_id: 1,
    add_time: "2024-05-06 08:00:00",
  };

  function workspaceWithOrganization(notes: unknown): FakeWorkspace {
    const world = new FakeWorkspace().provisionBookkeepingColumns();

    world.addRecord("organizations", {
      id: "organization-existing",
      name: "Acme",
      notes,
      customFieldValues: [
        {
          columnId: world.columnId("organizations", PIPEDRIVE_ID_COLUMN),
          value: "1",
        },
      ],
    });

    return world;
  }

  const source: SourceData = {
    users: PIPEDRIVE_USERS,
    organizations: [{ id: 1, name: "Acme" }],
    notes: [note],
  };

  it("appends to notes it can read", async () => {
    const world = workspaceWithOrganization(null);

    const report = await migrate({ world, source });

    const update = world.calls.find((call) => call.kind === "updateRecord" && call.entityPath === "organizations");

    expect(update && "payload" in update ? String(update.payload.notes ?? "") : "").toContain("Pipedrive note 300");
    expect(line(report, "notes")).toMatchObject({
      sourceCount: 1,
      targetCount: 1,
      skipped: 0,
      reconciled: true,
    });
  });

  it("refuses to overwrite notes it cannot read", async () => {
    const world = workspaceWithOrganization({
      type: "doc",
      content: [{ type: "not-a-real-node" }],
    });

    const report = await migrate({ world, source });

    expect(world.calls.some((call) => call.kind === "updateRecord" && call.entityPath === "organizations")).toBe(false);
    expect(world.records.organizations[0].notes).toEqual({
      type: "doc",
      content: [{ type: "not-a-real-node" }],
    });
    expect(line(report, "notes")).toMatchObject({
      sourceCount: 1,
      targetCount: 0,
      skipped: 1,
      reconciled: true,
    });
  });

  it("names the record whose notes it would not touch", async () => {
    const world = workspaceWithOrganization({
      type: "doc",
      content: [{ type: "not-a-real-node" }],
    });

    const report = await migrate({ world, source });

    expect(report.skipped[0]).toMatchObject({
      entity: "notes",
      sourceId: "300",
    });
    expect(report.skipped[0].reason).toContain("organization-existing");
  });
});

describe("a whole run", () => {
  it("reconciles every entity and leaves nothing skipped", async () => {
    const world = new FakeWorkspace();

    const report = await migrate({
      world,
      source: {
        users: PIPEDRIVE_USERS,
        pipelines: [{ id: 1, name: "Sales", order_nr: 1 }],
        stages: [
          { id: 10, name: "Discovery", order_nr: 1, pipeline_id: 1 },
          { id: 20, name: "Proposal", order_nr: 2, pipeline_id: 1 },
        ],
        organizations: [{ id: 1, name: "Acme", owner_id: 1 }],
        persons: [{ id: 5, name: "Grace Hopper", org_id: 1, owner_id: 1 }],
        deals: [
          {
            id: 100,
            title: "Renewal",
            status: "open",
            value: 1200,
            currency: "EUR",
            pipeline_id: 1,
            stage_id: 20,
            user_id: 1,
          },
          {
            id: 101,
            title: "Lost one",
            status: "lost",
            lost_reason: "Budget",
            pipeline_id: 1,
            stage_id: 10,
            user_id: 1,
          },
        ],
        activities: [
          {
            id: 200,
            subject: "Kickoff",
            type: "meeting",
            deal_id: 100,
            user_id: 1,
          },
        ],
        notes: [{ id: 300, content: "<p>Signed</p>", deal_id: 100 }],
      },
    });

    expect(report.skipped).toEqual([]);
    expect(report.reconciled).toBe(true);
    expect(report.entities.every((entry) => entry.reconciled)).toBe(true);
  });
});
