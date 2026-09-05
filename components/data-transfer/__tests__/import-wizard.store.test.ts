import type { PlanRow } from "@/features/data-transfer/import/import-plan";
import type { RootStore } from "@/core/stores/root.store";

import { runInAction } from "mobx";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EntityType } from "@/generated/prisma";

import { IMPORT_CHUNK_SIZE } from "@/features/data-transfer/data-transfer.schema";

const transferActions = vi.hoisted(() => ({
  commitImportChunkAction: vi.fn(),
  dryRunImportChunkAction: vi.fn(),
  getImportRelationIndexAction: vi.fn(),
  matchImportKeysAction: vi.fn(),
}));

vi.mock("@/app/[locale]/(protected)/data-transfer/actions", () => transferActions);

const columnActions = vi.hoisted(() => ({ getCustomColumnsByEntityTypeAction: vi.fn() }));

vi.mock("@/app/actions", () => columnActions);

const errors = vi.hoisted(() => ({ reportApplicationError: vi.fn(), isDemoEnvironment: vi.fn(() => false) }));

vi.mock("@/core/errors/report-application-error", () => errors);

import { ImportWizardStore } from "../import-wizard.store";

const rootStore = { registerModalStore: vi.fn() } as unknown as RootStore;

function planRow(sheetRow: number): PlanRow {
  return { sheetRow, sourceIndex: sheetRow - 2, recordId: null, payload: { name: `Row ${sheetRow}` } };
}

function makeStore(createRows: PlanRow[]) {
  const store = new ImportWizardStore(rootStore);

  runInAction(() => {
    store.entityType = EntityType.deal;
    store.plan = { create: createRows, update: [], issues: [] };
  });

  return store;
}

function issue(sheetRow: number, blocking = true) {
  return {
    sheetRow,
    columnLetter: null,
    columnLabel: null,
    fieldPath: "name",
    message: "bad",
    values: null,
    code: "relationNotFound",
    blocking,
  };
}

describe("ImportWizardStore blocked rows", () => {
  beforeEach(() => vi.clearAllMocks());

  it("offers to skip a row the planner dropped, so one bad relation cannot dead-end the file", () => {
    const store = makeStore([planRow(2), planRow(3)]);

    runInAction(() => {
      store.parsed = { rows: [{}, {}, {}] } as never;
      store.issues = [issue(4)];
    });

    expect(store.skippableCount).toBe(1);
    expect(store.hasBlockingIssues).toBe(true);

    runInAction(() => {
      store.skipInvalid = true;
    });

    expect(store.hasBlockingIssues).toBe(false);
  });

  it("counts a dropped row as skipped, so the summary adds up to the rows in the file", async () => {
    const store = makeStore([planRow(2), planRow(3)]);

    runInAction(() => {
      store.parsed = { rows: [{}, {}, {}] } as never;
      store.issues = [issue(4)];
      store.skipInvalid = true;
    });

    transferActions.commitImportChunkAction.mockResolvedValue({ ok: true, ids: ["a", "b"] });

    await store.commit();

    const summary = store.summary as { created: number; updated: number; skipped: number; notAttempted: number };
    expect(summary).toMatchObject({ created: 2, updated: 0, skipped: 1, notAttempted: 0 });
    expect(summary.created + summary.updated + summary.skipped + summary.notAttempted).toBe(3);
  });

  it("still refuses a blocking problem that belongs to no row", () => {
    const store = makeStore([planRow(2)]);

    runInAction(() => {
      store.parsed = { rows: [{}] } as never;
      store.issues = [{ ...issue(2), sheetRow: null }];
      store.skipInvalid = true;
    });

    expect(store.skippableCount).toBe(0);
    expect(store.hasBlockingIssues).toBe(true);
  });
});

describe("ImportWizardStore commit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stops at the first failing chunk and reports the rest as not attempted", async () => {
    const rows = Array.from({ length: IMPORT_CHUNK_SIZE * 3 }, (_, index) => planRow(index + 2));
    const store = makeStore(rows);

    transferActions.commitImportChunkAction
      .mockResolvedValueOnce({ ok: true, ids: rows.slice(0, IMPORT_CHUNK_SIZE).map((row) => `id-${row.sheetRow}`) })
      .mockResolvedValueOnce({ ok: false, failure: { kind: "invalid", issues: [] } });

    await store.commit();

    expect(transferActions.commitImportChunkAction).toHaveBeenCalledTimes(2);
    expect(store.summary).toMatchObject({
      created: IMPORT_CHUNK_SIZE,
      notAttempted: IMPORT_CHUNK_SIZE * 2,
      stoppedAtSheetRow: IMPORT_CHUNK_SIZE + 2,
    });
  });

  it("keeps what already committed when a chunk throws, so a retry cannot write it twice", async () => {
    const rows = Array.from({ length: IMPORT_CHUNK_SIZE * 3 }, (_, index) => planRow(index + 2));
    const store = makeStore(rows);

    runInAction(() => {
      store.parsed = { rows: rows.map(() => ({})) } as never;
    });

    transferActions.commitImportChunkAction
      .mockResolvedValueOnce({ ok: true, ids: rows.slice(0, IMPORT_CHUNK_SIZE).map((row) => `id-${row.sheetRow}`) })
      .mockRejectedValueOnce(new Error("Failed to fetch"));

    await store.commit();

    expect(transferActions.commitImportChunkAction).toHaveBeenCalledTimes(2);
    expect(store.step).toBe("result");
    expect(store.summary).toMatchObject({
      created: IMPORT_CHUNK_SIZE,
      notAttempted: IMPORT_CHUNK_SIZE * 2,
      stoppedAtSheetRow: IMPORT_CHUNK_SIZE + 2,
    });
  });

  it("reports a thrown chunk through the application error handler, like every other action", async () => {
    const store = makeStore([planRow(2)]);
    const thrown = new Error("Forbidden");

    runInAction(() => {
      store.parsed = { rows: [{}] } as never;
    });

    transferActions.commitImportChunkAction.mockRejectedValueOnce(thrown);

    await store.commit();

    expect(errors.reportApplicationError).toHaveBeenCalledWith(thrown);
    expect(store.step).toBe("result");
  });

  it("drops blocking rows from the payload and counts them as skipped when skipInvalid is set", async () => {
    const store = makeStore([planRow(2), planRow(3), planRow(4)]);

    runInAction(() => {
      store.skipInvalid = true;
      store.issues = [
        {
          sheetRow: 3,
          columnLetter: null,
          columnLabel: null,
          fieldPath: "name",
          message: "bad",
          values: null,
          code: "invalid",
          blocking: true,
        },
      ];
    });

    transferActions.commitImportChunkAction.mockResolvedValue({ ok: true, ids: ["a", "b"] });

    await store.commit();

    const sent = transferActions.commitImportChunkAction.mock.calls[0][0];
    expect(sent.rows).toHaveLength(2);
    expect(store.summary).toMatchObject({ created: 2, skipped: 1, notAttempted: 0 });
  });

  it("refuses to close while a commit is in flight and releases the guard afterwards", async () => {
    const store = makeStore([planRow(2)]);
    let release: (value: unknown) => void = () => {};

    transferActions.commitImportChunkAction.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    store.open();
    expect(store.isOpen).toBe(true);

    const inFlight = store.commit();
    expect(store.isLoading).toBe(true);

    store.close();
    expect(store.isOpen).toBe(true);

    release({ ok: true, ids: ["a"] });
    await inFlight;

    expect(store.isLoading).toBe(false);
    store.close();
    expect(store.isOpen).toBe(false);
  });
});

describe("ImportWizardStore delimited files", () => {
  beforeEach(() => vi.clearAllMocks());

  it("auto-matches a semicolon file, since a CSV carries no schema sheet to map from", async () => {
    const store = new ImportWizardStore(rootStore);

    runInAction(() => {
      store.entityType = EntityType.contact;
    });

    columnActions.getCustomColumnsByEntityTypeAction.mockResolvedValue([]);
    transferActions.getImportRelationIndexAction.mockResolvedValue({ ok: true, data: { index: {} } });

    const text = ["First Name;Last Name;Notes;Email", 'Ada;Lovelace;"Rechnung, Mahnung";ada@example.com'].join("\r\n");

    await store.selectFile(new File([text], "kontakte.csv"));

    expect(store.fileError).toBeNull();
    expect(store.step).toBe("mapping");
    expect(store.mapping).toEqual([
      { kind: "field", key: "firstName" },
      { kind: "field", key: "lastName" },
      { kind: "field", key: "notes" },
      { kind: "identifier", provider: "mail" },
    ]);
    expect(store.parsed?.rows).toEqual([
      { sourceIndex: 0, sheetRow: 2, cells: ["Ada", "Lovelace", "Rechnung, Mahnung", "ada@example.com"] },
    ]);
  });
});

describe("ImportWizardStore pipeline placement", () => {
  const SALES = "a0000000-0000-4000-8000-000000000001";
  const PARTNERS = "a0000000-0000-4000-8000-000000000002";
  const SALES_WON = "b0000000-0000-4000-8000-000000000001";
  const PARTNERS_WON = "b0000000-0000-4000-8000-000000000002";
  const SALES_DEMO = "b0000000-0000-4000-8000-000000000003";

  const pipelines = [
    { id: SALES, name: "Sales", isDefault: true, isArchived: false },
    { id: PARTNERS, name: "Partners", isDefault: false, isArchived: false },
  ];

  const stages = [
    { id: SALES_WON, name: "Won", pipelineId: SALES },
    { id: PARTNERS_WON, name: "Won", pipelineId: PARTNERS },
    { id: SALES_DEMO, name: "Demo", pipelineId: SALES },
  ];

  const ensurePipelinesLoaded = vi.fn(async () => {});

  const storeWithCatalog = () =>
    new ImportWizardStore({
      registerModalStore: vi.fn(),
      dealsStore: { ensurePipelinesLoaded, pipelines, stages },
    } as unknown as RootStore);

  function stageRows(store: ImportWizardStore, cells: string[]) {
    runInAction(() => {
      store.entityType = EntityType.deal;
      store.mapping = [{ kind: "field", key: "stageId" }];
      store.parsed = {
        sources: [{ index: 0, letter: "A", header: "Stage", samples: [] }],
        rows: cells.map((value, index) => ({ sourceIndex: index, sheetRow: index + 2, cells: [value] })),
        relationSheets: {},
      } as never;
    });
  }

  beforeEach(() => vi.clearAllMocks());

  it("loads the pipeline catalogue only for an entity whose fields need it", async () => {
    const store = storeWithCatalog();

    runInAction(() => {
      store.entityType = EntityType.contact;
    });
    expect(await store.loadCatalogIndex()).toEqual({});
    expect(ensurePipelinesLoaded).not.toHaveBeenCalled();

    runInAction(() => {
      store.entityType = EntityType.deal;
    });
    const index = await store.loadCatalogIndex();

    expect(ensurePipelinesLoaded).toHaveBeenCalledTimes(1);
    expect(index.stage?.get("sales / demo")).toEqual([SALES_DEMO]);
  });

  it("resolves a stage name to one id before the chunk leaves the browser", async () => {
    const store = storeWithCatalog();

    stageRows(store, ["Demo"]);
    runInAction(() => {
      store.catalogIndex = { stage: new Map([["demo", [SALES_DEMO]]]) };
    });

    transferActions.dryRunImportChunkAction.mockResolvedValue({ ok: true });

    await store.runDryRun();

    expect(transferActions.dryRunImportChunkAction.mock.calls[0][0].rows).toEqual([{ stageId: SALES_DEMO }]);
    expect(store.issues).toEqual([]);
    expect(store.step).toBe("preview");
  });

  it("blocks a stage name two pipelines share and never sends the row", async () => {
    const store = storeWithCatalog();

    stageRows(store, ["Won"]);
    runInAction(() => {
      store.catalogIndex = { stage: new Map([["won", [SALES_WON, PARTNERS_WON]]]) };
    });

    await store.runDryRun();

    expect(transferActions.dryRunImportChunkAction).not.toHaveBeenCalled();
    expect(store.issues.map((issue) => issue.code)).toEqual(["stageAmbiguous"]);
    expect(store.hasBlockingIssues).toBe(true);
    expect(store.skippableCount).toBe(1);
  });

  it("lets the qualified name through, so a multi-pipeline file is not blocked wholesale", async () => {
    const store = storeWithCatalog();

    stageRows(store, ["Sales / Won", "Partners / Won"]);
    runInAction(() => {
      store.catalogIndex = {
        stage: new Map([
          ["won", [SALES_WON, PARTNERS_WON]],
          ["sales / won", [SALES_WON]],
          ["partners / won", [PARTNERS_WON]],
        ]),
      };
    });

    transferActions.dryRunImportChunkAction.mockResolvedValue({ ok: true });

    await store.runDryRun();

    expect(store.issues).toEqual([]);
    expect(transferActions.dryRunImportChunkAction.mock.calls[0][0].rows).toEqual([
      { stageId: SALES_WON },
      { stageId: PARTNERS_WON },
    ]);
  });
});

describe("ImportWizardStore duplicate handling", () => {
  const CONTACT_ONE = "c0000000-0000-4000-8000-000000000001";
  const CONTACT_TWO = "c0000000-0000-4000-8000-000000000002";

  function emailRows(store: ImportWizardStore, values: string[]) {
    runInAction(() => {
      store.entityType = EntityType.contact;
      store.mapping = [
        { kind: "field", key: "firstName" },
        { kind: "identifier", provider: "mail" },
      ];
      store.parsed = {
        sources: [
          { index: 0, letter: "A", header: "Vorname", samples: [] },
          { index: 1, letter: "B", header: "E-Mail", samples: [] },
        ],
        rows: values.map((value, index) => ({ sourceIndex: index, sheetRow: index + 2, cells: ["Ada", value] })),
        relationSheets: {},
      } as never;
    });
  }

  beforeEach(() => vi.clearAllMocks());

  it("offers only the mapped columns that can identify a record", () => {
    const store = new ImportWizardStore(rootStore);
    emailRows(store, ["ada@example.com"]);

    expect(store.duplicateKeyColumns.map((column) => column.letter)).toEqual(["A", "B"]);
    expect(store.duplicateKeyColumns[1].key).toEqual({ kind: "identifier", provider: "mail" });
  });

  it("asks nothing of the server while the strategy is the default", async () => {
    const store = new ImportWizardStore(rootStore);
    emailRows(store, ["ada@example.com"]);
    transferActions.dryRunImportChunkAction.mockResolvedValue({ ok: true });

    await store.runDryRun();

    expect(transferActions.matchImportKeysAction).not.toHaveBeenCalled();
    expect(store.plan?.create).toHaveLength(1);
    expect(store.plan?.update).toEqual([]);
  });

  it("updates the record a nominated key found instead of adding a second one", async () => {
    const store = new ImportWizardStore(rootStore);
    emailRows(store, ["ada@example.com", "grace@example.com"]);

    runInAction(() => {
      store.duplicateKeyIndex = 1;
      store.duplicateStrategy = "update";
    });

    transferActions.matchImportKeysAction.mockResolvedValue({
      ok: true,
      data: { matches: [["ada@example.com", [CONTACT_ONE]]] },
    });
    transferActions.dryRunImportChunkAction.mockResolvedValue({ ok: true });

    await store.runDryRun();

    expect(transferActions.matchImportKeysAction).toHaveBeenCalledWith({
      entityType: EntityType.contact,
      key: { kind: "identifier", provider: "mail" },
      values: ["ada@example.com", "grace@example.com"],
    });
    expect(store.plan?.update.map((row) => row.payload.id)).toEqual([CONTACT_ONE]);
    expect(store.plan?.create.map((row) => row.sheetRow)).toEqual([3]);
  });

  it("blocks a key that matched two records rather than picking one of them", async () => {
    const store = new ImportWizardStore(rootStore);
    emailRows(store, ["ada@example.com"]);

    runInAction(() => {
      store.duplicateKeyIndex = 1;
      store.duplicateStrategy = "update";
    });

    transferActions.matchImportKeysAction.mockResolvedValue({
      ok: true,
      data: { matches: [["ada@example.com", [CONTACT_ONE, CONTACT_TWO]]] },
    });

    await store.runDryRun();

    expect(transferActions.dryRunImportChunkAction).not.toHaveBeenCalled();
    expect(store.issues.map((issue) => issue.code)).toEqual(["duplicateKeyAmbiguous"]);
    expect(store.hasBlockingIssues).toBe(true);
  });

  it("refuses to import blind when the lookup itself failed", async () => {
    const store = new ImportWizardStore(rootStore);
    emailRows(store, ["ada@example.com"]);

    runInAction(() => {
      store.duplicateKeyIndex = 1;
      store.duplicateStrategy = "skip";
    });

    transferActions.matchImportKeysAction.mockResolvedValue({ ok: false, error: {} });

    await store.runDryRun();

    expect(store.issues.map((issue) => issue.code)).toEqual(["duplicateLookupFailed"]);
    expect(store.hasBlockingIssues).toBe(true);
    expect(store.skippableCount).toBe(0);
  });

  it("drops the strategy back to adding records when the key column is cleared", () => {
    const store = new ImportWizardStore(rootStore);
    emailRows(store, ["ada@example.com"]);

    store.setDuplicateKeyIndex(1);
    store.setDuplicateStrategy("skip");
    expect(store.duplicateKeyColumn?.letter).toBe("B");

    store.setDuplicateKeyIndex(null);
    expect(store.duplicateStrategy).toBe("create");
    expect(store.duplicateKeyColumn).toBeNull();
  });
});
