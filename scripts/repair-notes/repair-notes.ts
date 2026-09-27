import type { HistoryKind, NotesDocument, NotesShape, NotesSnapshot } from "./notes-shape";

import { HISTORY_KINDS, NOTES_SHAPES, judgeHistory, readStoredColumn, repairValue } from "./notes-shape";

export type Database = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }>;
};

export const NOTES_TABLES = [
  { table: "Contact", entity: "contact" },
  { table: "Deal", entity: "deal" },
  { table: "Organization", entity: "organization" },
  { table: "Lead", entity: "lead" },
  { table: "Task", entity: "task" },
  { table: "Service", entity: "service" },
] as const;

export type NotesTable = (typeof NOTES_TABLES)[number];

export type NotesTableName = NotesTable["table"];

export const PLAN_KINDS = ["convert", "clear", "unreadable", "oversize"] as const;

export type PlanKind = Exclude<(typeof PLAN_KINDS)[number], "oversize">;

export const REPAIR_OUTCOMES = ["converted", "restored", "cleared", "held", "unreadable", "changed", "locked"] as const;

export type RepairOutcome = (typeof REPAIR_OUTCOMES)[number];

export type HistoryPolicy = "hold" | "restore" | "discard";

export type ScanScope = { companyId?: string; batchSize: number };

export type ApplyScope = ScanScope & { history: HistoryPolicy };

export type CensusFinding = {
  id: string;
  companyId: string;
  shape: NotesShape;
  plan?: PlanKind;
  history?: HistoryKind;
  oversize?: true;
};

export type TableCensus = {
  table: NotesTableName;
  total: number;
  shapes: Record<NotesShape, number>;
  plan: Record<(typeof PLAN_KINDS)[number], number>;
  history: Record<HistoryKind, number>;
  findings: CensusFinding[];
};

export type RepairFinding = {
  id: string;
  companyId: string;
  shape: "string" | "message";
  outcome: RepairOutcome;
  history?: HistoryKind;
  oversize?: true;
};

export type TableRepair = {
  table: NotesTableName;
  outcomes: Record<RepairOutcome, number>;
  oversize: number;
  discarded: number;
  findings: RepairFinding[];
};

export type RepairRun = { tables: TableRepair[]; aborted: { table: NotesTableName; message: string } | null };

export type StoredRow = { id: string; companyId: string; raw: string | null };

type TableCounts = { total: number; sqlNull: number; jsonNull: number };

type AuditRow = { entityId: string; companyId: string; event: string; raw: string | null };

type RowResult = { outcome: RepairOutcome; finding: RepairFinding };

const LOCK_CONFLICT_CODES = new Set(["55P03", "40P01"]);

const CENSUS_FILTER = `"notes" IS NOT NULL AND jsonb_typeof("notes") <> 'null'`;

const CANDIDATE_FILTER =
  `(jsonb_typeof("notes") = 'string' OR ("notes" = jsonb_build_object('message', "notes" -> 'message') ` +
  `AND jsonb_typeof("notes" -> 'message') = 'string'))`;

function zeroed<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
}

function isLockConflict(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && LOCK_CONFLICT_CODES.has(String((error as { code?: unknown }).code))
  );
}

async function* storedPages(
  db: Database,
  table: NotesTable,
  filter: string,
  scope: ScanScope,
): AsyncGenerator<StoredRow[]> {
  let after = "";

  for (;;) {
    const { rows } = await db.query(
      `SELECT "id", "companyId", "notes"::text AS "raw" FROM "${table.table}" ` +
        `WHERE ${filter} AND ($1::text IS NULL OR "companyId" = $1) AND "id" > $2 ORDER BY "id" LIMIT $3`,
      [scope.companyId ?? null, after, scope.batchSize],
    );
    const page = rows as StoredRow[];
    if (page.length === 0) return;

    yield page;

    if (page.length < scope.batchSize) return;
    after = page[page.length - 1].id;
  }
}

async function countTable(db: Database, table: NotesTable, scope: ScanScope): Promise<TableCounts> {
  const { rows } = await db.query(
    `SELECT count(*)::int AS "total", count(*) FILTER (WHERE "notes" IS NULL)::int AS "sqlNull", ` +
      `count(*) FILTER (WHERE jsonb_typeof("notes") = 'null')::int AS "jsonNull" ` +
      `FROM "${table.table}" WHERE ($1::text IS NULL OR "companyId" = $1)`,
    [scope.companyId ?? null],
  );

  return rows[0] as TableCounts;
}

export async function historiesFor(
  db: Database,
  table: NotesTable,
  rows: readonly StoredRow[],
): Promise<Map<string, NotesSnapshot[]>> {
  const histories = new Map<string, NotesSnapshot[]>();
  if (rows.length === 0) return histories;

  const owners = new Map(rows.map((row) => [row.id, row.companyId]));
  const created = `${table.entity}.created`;
  const updated = `${table.entity}.updated`;

  const { rows: audits } = await db.query(
    `SELECT "entityId", "companyId", "event", (CASE WHEN "event" = $2 THEN "eventData" -> 'payload' -> 'notes' ` +
      `ELSE "eventData" -> 'payload' -> $4::text -> 'notes' END)::text AS "raw" FROM "AuditLog" ` +
      `WHERE "entityId" = ANY($1::text[]) AND "event" IN ($2, $3) ` +
      `ORDER BY "entityId", "createdAt", ("event" = $3), "id"`,
    [[...owners.keys()], created, updated, table.entity],
  );

  for (const audit of audits as AuditRow[]) {
    if (audit.raw === null || owners.get(audit.entityId) !== audit.companyId) continue;

    const snapshots = histories.get(audit.entityId) ?? [];
    snapshots.push({ event: audit.event === created ? "created" : "updated", value: JSON.parse(audit.raw) });
    histories.set(audit.entityId, snapshots);
  }

  return histories;
}

function planFor(repair: ReturnType<typeof repairValue>): PlanKind {
  if (repair.kind === "convert") return "convert";
  if (repair.kind === "clear") return "clear";

  return "unreadable";
}

export async function censusTable(db: Database, table: NotesTable, scope: ScanScope): Promise<TableCensus> {
  const counts = await countTable(db, table, scope);
  const census: TableCensus = {
    table: table.table,
    total: counts.total,
    shapes: { ...zeroed(NOTES_SHAPES), jsonNull: counts.jsonNull, sqlNull: counts.sqlNull },
    plan: zeroed(PLAN_KINDS),
    history: zeroed(HISTORY_KINDS),
    findings: [],
  };

  for await (const page of storedPages(db, table, CENSUS_FILTER, scope)) {
    const strings: Array<{ row: StoredRow; text: string; finding: CensusFinding }> = [];

    for (const row of page) {
      const stored = readStoredColumn(row.raw);
      census.shapes[stored.shape] += 1;
      if (stored.shape === "doc") continue;

      const finding: CensusFinding = { id: row.id, companyId: row.companyId, shape: stored.shape };
      census.findings.push(finding);
      if (stored.shape !== "string" && stored.shape !== "message") continue;

      const repair = repairValue(stored.value);
      finding.plan = planFor(repair);
      census.plan[finding.plan] += 1;
      if (repair.kind === "convert" && repair.oversize) {
        finding.oversize = true;
        census.plan.oversize += 1;
      }
      if (typeof stored.value === "string" && finding.plan !== "unreadable")
        strings.push({ row, text: stored.value, finding });
    }

    const stringRows = strings.map((entry) => entry.row);
    const histories = await historiesFor(db, table, stringRows);
    for (const { row, text, finding } of strings) {
      finding.history = judgeHistory(text, histories.get(row.id) ?? []).kind;
      census.history[finding.history] += 1;
    }
  }

  return census;
}

export async function censusNotes(db: Database, scope: ScanScope): Promise<TableCensus[]> {
  const censuses: TableCensus[] = [];
  for (const table of NOTES_TABLES) censuses.push(await censusTable(db, table, scope));

  return censuses;
}

export async function writeNotesIfUnchanged(
  db: Database,
  table: NotesTableName,
  row: StoredRow,
  notes: NotesDocument | null,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE "${table}" SET "notes" = $1::jsonb WHERE "id" = $2 AND "companyId" = $3 AND "notes" = $4::jsonb`,
    [notes === null ? null : JSON.stringify(notes), row.id, row.companyId, row.raw],
  );

  return rowCount === 1;
}

async function writeInSavepoint(
  db: Database,
  table: NotesTableName,
  row: StoredRow,
  notes: NotesDocument | null,
): Promise<"written" | "changed" | "locked"> {
  await db.query("SAVEPOINT repair_notes_row");
  try {
    const written = await writeNotesIfUnchanged(db, table, row, notes);
    await db.query("RELEASE SAVEPOINT repair_notes_row");

    return written ? "written" : "changed";
  } catch (error) {
    if (!isLockConflict(error)) throw error;
    await db.query("ROLLBACK TO SAVEPOINT repair_notes_row");
    await db.query("RELEASE SAVEPOINT repair_notes_row");

    return "locked";
  }
}

async function repairRow(
  db: Database,
  table: NotesTable,
  row: StoredRow,
  snapshots: readonly NotesSnapshot[],
  policy: HistoryPolicy,
): Promise<RowResult> {
  const stored = readStoredColumn(row.raw);
  const shape = stored.shape === "message" ? "message" : "string";
  const finding: RepairFinding = { id: row.id, companyId: row.companyId, shape, outcome: "unreadable" };
  const result = (outcome: RepairOutcome): RowResult => {
    finding.outcome = outcome;
    return { outcome, finding };
  };

  if (stored.shape !== "string" && stored.shape !== "message") return result("unreadable");

  const repair = repairValue(stored.value);
  if (repair.kind === "unreadable") return result("unreadable");

  let notes = repair.kind === "convert" ? repair.notes : null;
  let oversize = repair.kind === "convert" && repair.oversize;
  let outcome: RepairOutcome = repair.kind === "convert" ? "converted" : "cleared";

  if (typeof stored.value === "string") {
    const verdict = judgeHistory(stored.value, snapshots);
    finding.history = verdict.kind;

    if (verdict.kind === "recoverable" && policy === "hold") return result("held");
    if (verdict.kind === "recoverable" && policy === "restore") {
      notes = verdict.notes;
      oversize = verdict.oversize;
      outcome = "restored";
    }
  }

  if (oversize) finding.oversize = true;
  const write = await writeInSavepoint(db, table.table, row, notes);

  return result(write === "written" ? outcome : write);
}

async function lockCompanies(db: Database, page: readonly StoredRow[]): Promise<boolean> {
  const companyIds = [...new Set(page.map((row) => row.companyId))].sort();

  try {
    for (const companyId of companyIds)
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [companyId]);
    return true;
  } catch (error) {
    if (isLockConflict(error)) return false;
    throw error;
  }
}

function lockedPage(page: readonly StoredRow[]): RowResult[] {
  return page.map((row) => {
    const shape = readStoredColumn(row.raw).shape === "message" ? "message" : "string";
    const finding: RepairFinding = { id: row.id, companyId: row.companyId, shape, outcome: "locked" };

    return { outcome: "locked", finding };
  });
}

export function emptyRepair(table: NotesTableName): TableRepair {
  return { table, outcomes: zeroed(REPAIR_OUTCOMES), oversize: 0, discarded: 0, findings: [] };
}

function record(repaired: TableRepair, results: readonly RowResult[]): void {
  for (const { outcome, finding } of results) {
    repaired.outcomes[outcome] += 1;
    if (finding.oversize && (outcome === "converted" || outcome === "restored")) repaired.oversize += 1;
    if (outcome === "converted" && finding.history === "recoverable") repaired.discarded += 1;
    repaired.findings.push(finding);
  }
}

export async function repairTable(
  db: Database,
  table: NotesTable,
  scope: ApplyScope,
  repaired: TableRepair = emptyRepair(table.table),
): Promise<TableRepair> {
  for await (const page of storedPages(db, table, CANDIDATE_FILTER, scope)) {
    const histories = await historiesFor(
      db,
      table,
      page.filter((row) => readStoredColumn(row.raw).shape === "string"),
    );

    await db.query("BEGIN");
    try {
      if (!(await lockCompanies(db, page))) {
        await db.query("ROLLBACK");
        record(repaired, lockedPage(page));
        continue;
      }

      const results: RowResult[] = [];
      for (const row of page) results.push(await repairRow(db, table, row, histories.get(row.id) ?? [], scope.history));
      await db.query("COMMIT");
      record(repaired, results);
    } catch (error) {
      await db.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }

  return repaired;
}

export async function repairAllNotes(db: Database, scope: ApplyScope): Promise<RepairRun> {
  const tables: TableRepair[] = [];

  for (const table of NOTES_TABLES) {
    const repaired = emptyRepair(table.table);
    tables.push(repaired);
    try {
      await repairTable(db, table, scope, repaired);
    } catch (error) {
      return {
        tables,
        aborted: { table: table.table, message: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  return { tables, aborted: null };
}
