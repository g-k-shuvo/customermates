import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { OpenSession } from "../cli";
import type { Database, NotesTable, NotesTableName, RepairOutcome, TableCensus, TableRepair } from "../repair-notes";

import { parseMarkdownToJSON } from "@/components/editor/editor.utils";
import { plainTextToNotesDocument } from "@/components/editor/notes-document";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

import { EXIT, runRepairNotes } from "../cli";
import { describeDatasource, resolveDatasource } from "../datasource";
import { NOTES_TABLES, censusNotes, repairAllNotes, repairTable, writeNotesIfUnchanged } from "../repair-notes";

const RICH_DOC = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "underlined", marks: [{ type: "underline" }] },
        { type: "text", text: " and " },
        {
          type: "text",
          text: "a link",
          marks: [{ type: "link", attrs: { href: "https://example.com", target: "_blank" } }],
        },
      ],
    },
  ],
};

const EMBEDDED_DOC = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "was stored as a string" }] }],
};

const TEXT = {
  plain: "Contact changed by automation",
  paragraphs: "first line\nsecond line\n\n  third para  ",
  list: "Follow-ups:\n\n- call Anna\n- send the offer\n\n1. first\n2. second",
  blank: "  \n\t ",
  embedded: JSON.stringify(EMBEDDED_DOC),
  embeddedInvalid: JSON.stringify({ type: "doc", content: [{ type: "banana" }] }),
};

const MESSAGE =
  "hello from the form\n\n- item one\n- item two\n\n![x](https://t.example/p.png) [click](https://evil.example)";

const FIXTURES = {
  plain: JSON.stringify(TEXT.plain),
  paragraphs: JSON.stringify(TEXT.paragraphs),
  list: JSON.stringify(TEXT.list),
  blank: JSON.stringify(TEXT.blank),
  embedded: JSON.stringify(TEXT.embedded),
  embeddedInvalid: JSON.stringify(TEXT.embeddedInvalid),
  message: JSON.stringify({ message: MESSAGE }),
  blankMessage: JSON.stringify({ message: "   " }),
  messagePlus: JSON.stringify({ message: "x", other: 1 }),
  rich: JSON.stringify(RICH_DOC),
  emptyDoc: JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }),
  jsonNull: "null",
  sqlNull: null,
  emptyObject: "{}",
  array: "[1,2]",
  number: "42",
} as const satisfies Record<string, string | null>;

type Fixture = keyof typeof FIXTURES;

const FIXTURE_NAMES = Object.keys(FIXTURES) as Fixture[];

const CONVERTED: Partial<Record<Fixture, unknown>> = {
  plain: parseMarkdownToJSON(TEXT.plain),
  paragraphs: parseMarkdownToJSON(TEXT.paragraphs.trim()),
  list: parseMarkdownToJSON(TEXT.list.trim()),
  embedded: EMBEDDED_DOC,
  message: plainTextToNotesDocument(MESSAGE),
};

const CLEARED: Fixture[] = ["blank", "blankMessage"];

const UNTOUCHED = FIXTURE_NAMES.filter((name) => !(name in CONVERTED) && !CLEARED.includes(name));

const HELD_IN_DEAL: Fixture[] = ["plain", "list"];

const OLD_UPDATED_AT = "2026-01-02 03:04:05.678";

const INSERT_COLUMNS: Record<NotesTableName, { columns: string; constants: string }> = {
  Contact: { columns: `"id", "companyId", "lastName", "notes", "updatedAt", "firstName"`, constants: `'Repair'` },
  Deal: { columns: `"id", "companyId", "name", "notes", "updatedAt"`, constants: "" },
  Organization: { columns: `"id", "companyId", "name", "notes", "updatedAt"`, constants: "" },
  Lead: { columns: `"id", "companyId", "title", "notes", "updatedAt"`, constants: "" },
  Task: { columns: `"id", "companyId", "name", "notes", "updatedAt", "type"`, constants: `'custom'` },
  Service: { columns: `"id", "companyId", "name", "notes", "updatedAt", "amount"`, constants: "0" },
};

function insertRows(name: NotesTableName, count: number): string {
  const { columns, constants } = INSERT_COLUMNS[name];
  const tuples = Array.from({ length: count }, (_, row) => {
    const base = row * 5;
    const values = `$${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::jsonb, $${base + 5}::timestamp`;

    return `(${constants ? `${values}, ${constants}` : values})`;
  });

  return `INSERT INTO "${name}" (${columns}) VALUES ${tuples.join(", ")}`;
}

type Workspace = { companyId: string; userId: string; ids: Record<NotesTableName, Record<Fixture, string>> };

type StoredState = { raw: string | null; updatedAt: string };

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

function contentOf(markdown: string): unknown[] {
  return (parseMarkdownToJSON(markdown) as { content: unknown[] }).content;
}

function table(name: NotesTableName): NotesTable {
  const found = NOTES_TABLES.find((entry) => entry.table === name);
  if (!found) throw new Error(`unknown table ${name}`);

  return found;
}

function byTable<T extends { table: NotesTableName }>(entries: readonly T[], name: NotesTableName): T {
  const found = entries.find((entry) => entry.table === name);
  if (!found) throw new Error(`no result for ${name}`);

  return found;
}

function outcomes(values: Partial<Record<RepairOutcome, number>>): Record<RepairOutcome, number> {
  return { converted: 0, restored: 0, cleared: 0, held: 0, unreadable: 0, changed: 0, locked: 0, ...values };
}

function written(repair: TableRepair): number {
  return repair.outcomes.converted + repair.outcomes.restored + repair.outcomes.cleared;
}

describeDatabase("notes repair against a real database", { timeout: 180_000 }, () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyIds: string[] = [];
  const workspaces = {} as Record<
    "census" | "restore" | "foreign" | "cliApply" | "changing" | "locking" | "advisory" | "aborting" | "ties",
    Workspace
  >;

  async function audit(
    workspace: Workspace,
    name: NotesTableName,
    entityId: string,
    event: "created" | "updated",
    notes: unknown,
    createdAt: string,
    id: string = randomUUID(),
  ) {
    const entity = table(name).entity;
    const payload = event === "created" ? { id: entityId, notes } : { [entity]: { id: entityId, notes }, changes: {} };
    await client.query(
      `INSERT INTO "AuditLog" ("id", "event", "eventData", "companyId", "userId", "entityId", "createdAt") VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)`,
      [
        id,
        `${entity}.${event}`,
        JSON.stringify({ userId: workspace.userId, companyId: workspace.companyId, entityId, payload }),
        workspace.companyId,
        workspace.userId,
        entityId,
        createdAt,
      ],
    );
  }

  async function createWorkspace(): Promise<Workspace> {
    const companyId = randomUUID();
    const userId = randomUUID();
    companyIds.push(companyId);

    await client.query(`INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, NOW())`, [companyId]);
    await client.query(
      `INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, 'Repair', 'Notes', $3, NOW())`,
      [userId, `repair-notes-${companyId}@example.invalid`, companyId],
    );

    const ids = {} as Workspace["ids"];
    for (const { table: name } of NOTES_TABLES) {
      ids[name] = Object.fromEntries(FIXTURE_NAMES.map((fixture) => [fixture, randomUUID()])) as Record<
        Fixture,
        string
      >;
      await client.query(
        insertRows(name, FIXTURE_NAMES.length),
        FIXTURE_NAMES.flatMap((fixture) => [
          ids[name][fixture],
          companyId,
          `${name} ${fixture}`,
          FIXTURES[fixture],
          OLD_UPDATED_AT,
        ]),
      );
    }

    return { companyId, userId, ids };
  }

  async function seedHistory(workspace: Workspace) {
    const deal = workspace.ids.Deal;
    await audit(workspace, "Deal", deal.plain, "created", RICH_DOC, "2026-02-01T10:00:00Z");
    await audit(workspace, "Deal", deal.plain, "updated", "older automation note", "2026-02-02T10:00:00Z");
    await audit(workspace, "Deal", deal.paragraphs, "created", null, "2026-02-01T10:00:00Z");
    await audit(workspace, "Deal", deal.list, "updated", { message: "from the form" }, "2026-02-01T10:00:00Z");
    await audit(workspace, "Deal", deal.embedded, "created", {}, "2026-02-01T10:00:00Z");

    const contact = workspace.ids.Contact;
    await audit(workspace, "Contact", contact.plain, "updated", TEXT.plain, "2026-02-01T10:00:00Z");
    await audit(workspace, "Contact", contact.paragraphs, "created", TEXT.paragraphs, "2026-02-01T10:00:00Z");
    await audit(workspaces.foreign, "Contact", contact.list, "created", RICH_DOC, "2026-02-01T10:00:00Z");
  }

  async function stateOf(workspace: Workspace): Promise<Map<string, StoredState>> {
    const states = new Map<string, StoredState>();
    for (const { table: name } of NOTES_TABLES) {
      const { rows } = await client.query<{ id: string; raw: string | null; updatedAt: string }>(
        `SELECT "id", "notes"::text AS "raw", "updatedAt"::text AS "updatedAt" FROM "${name}" WHERE "companyId" = $1`,
        [workspace.companyId],
      );
      for (const row of rows) states.set(row.id, { raw: row.raw, updatedAt: row.updatedAt });
    }

    return states;
  }

  async function auditRowsOf(...workspaceList: Workspace[]) {
    const { rows } = await client.query(
      `SELECT "id", "event", "eventData"::text AS "data", "entityId", "createdAt"::text AS "at" FROM "AuditLog" ` +
        `WHERE "companyId" = ANY($1::text[]) ORDER BY "id"`,
      [workspaceList.map((workspace) => workspace.companyId)],
    );

    return rows;
  }

  function notesOf(states: Map<string, StoredState>, id: string): unknown {
    const raw = states.get(id)?.raw;
    if (raw === undefined) throw new Error(`row ${id} is missing`);

    return raw === null ? undefined : JSON.parse(raw);
  }

  async function withSecondSession<T>(fn: (other: Client) => Promise<T>): Promise<T> {
    const other = new Client({ connectionString: databaseUrl ?? undefined });
    await other.connect();
    try {
      return await fn(other);
    } finally {
      await other.query("ROLLBACK").catch(() => undefined);
      await other.end();
    }
  }

  async function withLockTimeout<T>(fn: () => Promise<T>): Promise<T> {
    await client.query("SET lock_timeout = '500ms'");
    try {
      return await fn();
    } finally {
      await client.query("RESET lock_timeout");
    }
  }

  function capture() {
    const output = { out: "", err: "" };
    const sink = {
      write: (text: string) => {
        output.out += text;
      },
      error: (text: string) => {
        output.err += text;
      },
    };

    return { output, sink };
  }

  beforeAll(async () => {
    expect(resolveDatasource(process.env).url).toBe(databaseUrl);
    await client.connect();

    workspaces.foreign = await createWorkspace();
    for (const name of [
      "census",
      "restore",
      "cliApply",
      "changing",
      "locking",
      "advisory",
      "aborting",
      "ties",
    ] as const)
      workspaces[name] = await createWorkspace();
    await seedHistory(workspaces.census);
    await seedHistory(workspaces.restore);
    await seedHistory(workspaces.cliApply);
  }, 120_000);

  afterAll(async () => {
    if (companyIds.length > 0) await client.query(`DELETE FROM "Company" WHERE "id" = ANY($1::text[])`, [companyIds]);
    await client.end();
  }, 120_000);

  it("counts every notes shape per table and judges from AuditLog what was destroyed", async () => {
    const { census } = workspaces;
    const censuses = await censusNotes(client, { companyId: census.companyId, batchSize: 5 });

    expect(censuses.map((entry) => entry.table)).toEqual([
      "Contact",
      "Deal",
      "Organization",
      "Lead",
      "Task",
      "Service",
    ]);
    for (const entry of censuses) {
      expect(entry.total, entry.table).toBe(16);
      expect(entry.shapes, entry.table).toEqual({ string: 6, message: 2, doc: 2, other: 4, jsonNull: 1, sqlNull: 1 });
      expect(entry.plan, entry.table).toEqual({ convert: 5, clear: 2, unreadable: 1, oversize: 0 });
    }

    expect(byTable(censuses, "Deal").history).toEqual({
      noHistory: 1,
      nothingLost: 1,
      recoverable: 2,
      unreadableHistory: 1,
    });
    expect(byTable(censuses, "Contact").history).toEqual({
      noHistory: 4,
      nothingLost: 1,
      recoverable: 0,
      unreadableHistory: 0,
    });
    for (const name of ["Organization", "Lead", "Task", "Service"] as const) {
      expect(byTable(censuses, name).history, name).toEqual({
        noHistory: 5,
        nothingLost: 0,
        recoverable: 0,
        unreadableHistory: 0,
      });
    }

    const deal = byTable(censuses, "Deal");
    const findingFor = (entry: TableCensus, id: string) => entry.findings.find((finding) => finding.id === id);
    expect(findingFor(deal, census.ids.Deal.plain)).toMatchObject({
      shape: "string",
      plan: "convert",
      history: "recoverable",
    });
    expect(findingFor(deal, census.ids.Deal.blankMessage)).toMatchObject({ shape: "message", plan: "clear" });
    expect(findingFor(deal, census.ids.Deal.emptyObject)).toMatchObject({ shape: "other" });
    expect(findingFor(deal, census.ids.Deal.rich)).toBeUndefined();
  });

  it("converts as the app writes, holds back what AuditLog can restore, and touches nothing else", async () => {
    const { census, restore } = workspaces;
    const before = await stateOf(census);
    const otherCompany = await stateOf(restore);

    const run = await repairAllNotes(client, { companyId: census.companyId, batchSize: 4, history: "hold" });

    expect(run.aborted).toBeNull();
    for (const repair of run.tables) {
      const held = repair.table === "Deal" ? 2 : 0;
      expect(repair.outcomes, repair.table).toEqual(outcomes({ converted: 5 - held, held, cleared: 2, unreadable: 1 }));
    }
    const heldFinding = byTable(run.tables, "Deal").findings.find((finding) => finding.id === census.ids.Deal.plain);
    expect(heldFinding).toMatchObject({ outcome: "held", history: "recoverable" });

    const after = await stateOf(census);
    for (const { table: name } of NOTES_TABLES) {
      const ids = census.ids[name];
      const held = name === "Deal" ? HELD_IN_DEAL : [];
      for (const [fixture, expected] of Object.entries(CONVERTED)) {
        if (held.includes(fixture as Fixture)) continue;
        expect(notesOf(after, ids[fixture as Fixture]), `${name} ${fixture}`).toEqual(expected);
      }
      for (const fixture of CLEARED) expect(after.get(ids[fixture])?.raw, `${name} ${fixture}`).toBeNull();
      for (const fixture of [...UNTOUCHED, ...held])
        expect(after.get(ids[fixture])?.raw, `${name} ${fixture}`).toBe(before.get(ids[fixture])?.raw);
      for (const fixture of FIXTURE_NAMES)
        expect(after.get(ids[fixture])?.updatedAt, `${name} ${fixture}`).toBe(OLD_UPDATED_AT);
    }
    expect(JSON.stringify(notesOf(after, census.ids.Lead.list))).toContain('"bulletList"');
    expect(JSON.stringify(notesOf(after, census.ids.Lead.message))).not.toMatch(/"bulletList"|"image"|"link"/u);
    expect(await stateOf(restore)).toEqual(otherCompany);

    const recount = await censusNotes(client, { companyId: census.companyId, batchSize: 200 });
    for (const entry of recount) {
      const held = entry.table === "Deal" ? 2 : 0;
      expect(entry.shapes, entry.table).toEqual({
        string: 1 + held,
        message: 0,
        doc: 7 - held,
        other: 4,
        jsonNull: 1,
        sqlNull: 3,
      });
    }

    const again = await repairAllNotes(client, { companyId: census.companyId, batchSize: 4, history: "hold" });
    for (const repair of again.tables) expect(written(repair), repair.table).toBe(0);
    expect(byTable(again.tables, "Deal").outcomes.held).toBe(2);
    expect(await stateOf(census)).toEqual(after);

    const discarded = await repairAllNotes(client, { companyId: census.companyId, batchSize: 4, history: "discard" });
    expect(byTable(discarded.tables, "Deal")).toMatchObject({
      outcomes: outcomes({ converted: 2, unreadable: 1 }),
      discarded: 2,
    });
    for (const name of ["Contact", "Organization", "Lead", "Task", "Service"] as const)
      expect(written(byTable(discarded.tables, name)), name).toBe(0);
    const final = await stateOf(census);
    expect(notesOf(final, census.ids.Deal.plain)).toEqual(CONVERTED.plain);
    expect(notesOf(final, census.ids.Deal.list)).toEqual(CONVERTED.list);

    const idle = await repairAllNotes(client, { companyId: census.companyId, batchSize: 4, history: "restore" });
    for (const repair of idle.tables) expect(written(repair), repair.table).toBe(0);
    expect(await stateOf(census)).toEqual(final);
  });

  it("puts overwritten notes back from AuditLog when asked to, without touching AuditLog", async () => {
    const { restore, foreign } = workspaces;
    const auditBefore = await auditRowsOf(restore, foreign);

    const run = await repairAllNotes(client, { companyId: restore.companyId, batchSize: 3, history: "restore" });

    expect(byTable(run.tables, "Deal").outcomes).toEqual(
      outcomes({ converted: 3, restored: 2, cleared: 2, unreadable: 1 }),
    );
    for (const name of ["Contact", "Organization", "Lead", "Task", "Service"] as const)
      expect(byTable(run.tables, name).outcomes, name).toEqual(outcomes({ converted: 5, cleared: 2, unreadable: 1 }));

    const after = await stateOf(restore);
    const deal = restore.ids.Deal;
    expect(notesOf(after, deal.plain)).toEqual({
      type: "doc",
      content: [...RICH_DOC.content, ...contentOf("older automation note"), ...contentOf(TEXT.plain)],
    });
    expect(notesOf(after, deal.list)).toEqual({
      type: "doc",
      content: [...contentOf("from the form"), ...contentOf(TEXT.list.trim())],
    });
    expect(notesOf(after, deal.paragraphs)).toEqual(CONVERTED.paragraphs);
    expect(notesOf(after, deal.embedded)).toEqual(EMBEDDED_DOC);
    expect(after.get(deal.blank)?.raw).toBeNull();
    expect(notesOf(after, restore.ids.Contact.list)).toEqual(CONVERTED.list);
    for (const state of after.values()) expect(state.updatedAt).toBe(OLD_UPDATED_AT);
    expect(await auditRowsOf(restore, foreign)).toEqual(auditBefore);

    const again = await repairAllNotes(client, { companyId: restore.companyId, batchSize: 3, history: "restore" });
    for (const repair of again.tables) expect(written(repair), repair.table).toBe(0);
    expect(await stateOf(restore)).toEqual(after);
  });

  it("orders snapshots that share a timestamp by id, so census and apply pick the same base", async () => {
    const { ties } = workspaces;
    const tieDoc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "tie base" }] }] };
    const at = "2026-03-01T10:00:00Z";
    await audit(ties, "Deal", ties.ids.Deal.plain, "updated", tieDoc, at, `tie-a-${randomUUID()}`);
    await audit(ties, "Deal", ties.ids.Deal.plain, "updated", "tie middle", at, `tie-b-${randomUUID()}`);

    const censuses = await censusNotes(client, { companyId: ties.companyId, batchSize: 200 });
    const finding = byTable(censuses, "Deal").findings.find((entry) => entry.id === ties.ids.Deal.plain);
    expect(finding?.history).toBe("recoverable");

    await repairTable(client, table("Deal"), { companyId: ties.companyId, batchSize: 200, history: "restore" });
    expect(notesOf(await stateOf(ties), ties.ids.Deal.plain)).toEqual({
      type: "doc",
      content: [...tieDoc.content, ...contentOf("tie middle"), ...contentOf(TEXT.plain)],
    });
  });

  it("counts a row the app changed meanwhile as changed and keeps the app's value", async () => {
    const { changing } = workspaces;
    const target = changing.ids.Task.plain;
    const edited = JSON.stringify(parseMarkdownToJSON("edited by a person"));

    await withSecondSession(async (other) => {
      let intercepted = false;
      const db: Database = {
        query: async (text, values) => {
          if (!intercepted && text.startsWith(`UPDATE "Task" SET "notes"`) && values?.[1] === target) {
            intercepted = true;
            await other.query(`UPDATE "Task" SET "notes" = $1::jsonb WHERE "id" = $2`, [edited, target]);
          }

          return client.query(text, values);
        },
      };

      const repaired = await repairTable(db, table("Task"), {
        companyId: changing.companyId,
        batchSize: 50,
        history: "hold",
      });

      expect(repaired.outcomes).toEqual(outcomes({ converted: 4, cleared: 2, unreadable: 1, changed: 1 }));
      expect(repaired.findings.find((finding) => finding.id === target)?.outcome).toBe("changed");
    });

    expect(notesOf(await stateOf(changing), target)).toEqual(JSON.parse(edited));
  });

  it("marks a row the app keeps locked as locked, finishes the run, and converts it on a re-run", async () => {
    const { locking } = workspaces;
    const target = locking.ids.Organization.plain;

    await withSecondSession(async (other) => {
      await other.query("BEGIN");
      await other.query(`SELECT "id" FROM "Organization" WHERE "id" = $1 FOR UPDATE`, [target]);

      const run = await withLockTimeout(() =>
        repairAllNotes(client, { companyId: locking.companyId, batchSize: 3, history: "hold" }),
      );

      expect(run.aborted).toBeNull();
      expect(byTable(run.tables, "Organization").outcomes).toEqual(
        outcomes({ converted: 4, cleared: 2, unreadable: 1, locked: 1 }),
      );
      for (const name of ["Lead", "Task", "Service"] as const) expect(written(byTable(run.tables, name)), name).toBe(7);
      expect((await stateOf(locking)).get(target)?.raw).toBe(FIXTURES.plain);
    });

    const rerun = await repairAllNotes(client, { companyId: locking.companyId, batchSize: 3, history: "hold" });
    expect(byTable(rerun.tables, "Organization").outcomes).toEqual(outcomes({ converted: 1, unreadable: 1 }));
    expect(notesOf(await stateOf(locking), target)).toEqual(CONVERTED.plain);
  });

  it("waits for the company lock the app takes and skips the batch when it cannot get it", async () => {
    const { advisory } = workspaces;
    const before = await stateOf(advisory);

    await withSecondSession(async (other) => {
      await other.query("BEGIN");
      await other.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [advisory.companyId]);

      const run = await withLockTimeout(() =>
        repairAllNotes(client, { companyId: advisory.companyId, batchSize: 200, history: "hold" }),
      );

      expect(run.aborted).toBeNull();
      for (const repair of run.tables) expect(repair.outcomes, repair.table).toEqual(outcomes({ locked: 8 }));
      expect(await stateOf(advisory)).toEqual(before);
    });

    const rerun = await repairAllNotes(client, { companyId: advisory.companyId, batchSize: 200, history: "hold" });
    for (const repair of rerun.tables) expect(written(repair), repair.table).toBe(7);
  });

  it("aborts cleanly on an unexpected error: prints and reports what committed and exits 1", async () => {
    const { aborting } = workspaces;
    const directory = await mkdtemp(join(tmpdir(), "repair-notes-"));
    const reportPath = join(directory, "apply.json");
    const { output, sink } = capture();

    const open: OpenSession = async (datasource) => {
      const session = new Client({ ...datasource.connection, application_name: "repair-notes-test" });
      await session.connect();
      const db: Database = {
        query: async (text, values) => {
          if (text.startsWith(`UPDATE "Lead" SET "notes"`)) throw new Error("simulated failure");

          return session.query(text, values);
        },
      };

      return { db, close: () => session.end() };
    };

    try {
      const code = await runRepairNotes(
        ["--apply", "--company", aborting.companyId, "--report", reportPath],
        process.env,
        sink,
        open,
      );

      expect(code, output.err).toBe(EXIT.failed);
      expect(output.out).toMatch(/^Contact\s+5\s+0\s+2\s/mu);
      expect(output.out).toContain("ABORTED in Lead: simulated failure");
      expect(output.out).toContain("Tables not reached: Task, Service");

      const report = JSON.parse(await readFile(reportPath, "utf8"));
      expect(report).toMatchObject({
        mode: "apply",
        aborted: true,
        error: { table: "Lead", message: "simulated failure" },
      });
      expect(report.tables.map((entry: TableRepair) => entry.table)).toEqual([
        "Contact",
        "Deal",
        "Organization",
        "Lead",
      ]);
      expect(report.tables[3].outcomes).toEqual(outcomes({}));

      const after = await stateOf(aborting);
      for (const name of ["Contact", "Deal", "Organization"] as const)
        expect(notesOf(after, aborting.ids[name].plain), name).toEqual(CONVERTED.plain);
      for (const name of ["Lead", "Task", "Service"] as const)
        expect(after.get(aborting.ids[name].plain)?.raw, name).toBe(FIXTURES.plain);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("runs --apply from the command line and records every history verdict in the report", async () => {
    const { cliApply } = workspaces;
    const directory = await mkdtemp(join(tmpdir(), "repair-notes-"));

    try {
      const first = capture();
      const holdReport = join(directory, "hold.json");
      const held = await runRepairNotes(
        ["--apply", "--company", cliApply.companyId, "--report", holdReport],
        process.env,
        first.sink,
      );

      expect(held, first.output.err).toBe(EXIT.decide);
      expect(first.output.out).toContain("Mode: apply");
      expect(first.output.out).toContain("2 row(s) held back");
      const report = JSON.parse(await readFile(holdReport, "utf8"));
      expect(report).toMatchObject({ mode: "apply", history: "hold", aborted: false, error: null });
      const deal = report.tables.find((entry: TableRepair) => entry.table === "Deal") as TableRepair;
      const findingOf = (id: string) => deal.findings.find((finding) => finding.id === id);
      expect(findingOf(cliApply.ids.Deal.plain)).toMatchObject({ outcome: "held", history: "recoverable" });
      expect(findingOf(cliApply.ids.Deal.paragraphs)).toMatchObject({ outcome: "converted", history: "nothingLost" });
      expect(findingOf(cliApply.ids.Deal.blank)).toMatchObject({ outcome: "cleared", history: "noHistory" });
      expect(findingOf(cliApply.ids.Deal.message)).toMatchObject({ outcome: "converted", shape: "message" });

      const second = capture();
      const restored = await runRepairNotes(
        ["--apply", "--restore-from-audit", "--company", cliApply.companyId],
        process.env,
        second.sink,
      );

      expect(restored, second.output.err).toBe(EXIT.done);
      expect(second.output.out).toContain("Mode: apply, restoring overwritten notes from AuditLog");
      expect(second.output.out).toMatch(/^Deal\s+0\s+2\s+0\s+0\s+1\s/mu);
      expect(notesOf(await stateOf(cliApply), cliApply.ids.Deal.plain)).toEqual({
        type: "doc",
        content: [...RICH_DOC.content, ...contentOf("older automation note"), ...contentOf(TEXT.plain)],
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("leaves a row alone when the app changed it after the repair read it", async () => {
    const { foreign, census } = workspaces;
    const id = foreign.ids.Task.plain;
    const { rows } = await client.query<{ raw: string }>(`SELECT "notes"::text AS "raw" FROM "Task" WHERE "id" = $1`, [
      id,
    ]);
    const edited = JSON.stringify(parseMarkdownToJSON("edited by a person"));
    await client.query(`UPDATE "Task" SET "notes" = $1::jsonb WHERE "id" = $2`, [edited, id]);

    const stale = { id, companyId: foreign.companyId, raw: rows[0].raw };
    await expect(writeNotesIfUnchanged(client, "Task", stale, { type: "doc", content: [] })).resolves.toBe(false);
    await expect(
      writeNotesIfUnchanged(client, "Task", { ...stale, companyId: census.companyId, raw: edited }, null),
    ).resolves.toBe(false);

    const { rows: now } = await client.query<{ notes: unknown }>(`SELECT "notes" FROM "Task" WHERE "id" = $1`, [id]);
    expect(now[0].notes).toEqual(JSON.parse(edited));
  });

  it("runs the census from the command line against the database it names, in one read-only snapshot", async () => {
    const { foreign } = workspaces;
    const directory = await mkdtemp(join(tmpdir(), "repair-notes-"));
    const reportPath = join(directory, "census.json");
    const { output, sink } = capture();

    try {
      const before = await stateOf(foreign);
      const code = await runRepairNotes(["--company", foreign.companyId, "--report", reportPath], process.env, sink);

      expect(code, output.err).toBe(EXIT.done);
      const datasourceLine = describeDatasource(resolveDatasource(process.env));
      process.stdout.write(`${datasourceLine}\n`);
      expect(output.out.startsWith(`${datasourceLine}\n`)).toBe(true);
      expect(datasourceLine).toContain(`${new URL(databaseUrl ?? "").host}${new URL(databaseUrl ?? "").pathname}`);
      expect(output.out).toContain("Mode: census (read-only)");
      expect(output.out).toContain(`Scope: company ${foreign.companyId}`);
      expect(output.out).toMatch(/^Deal\s+16\s+6\s+2\s+2\s+4\s+1\s+1$/mu);
      expect(await stateOf(foreign)).toEqual(before);

      const report = await readFile(reportPath, "utf8");
      expect(JSON.parse(report)).toMatchObject({ mode: "census", history: null, companyId: foreign.companyId });
      expect(report).toContain(foreign.ids.Lead.message);
      expect(report).not.toContain("hello from the form");
      expect(report).not.toContain("Contact changed by automation");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
