import { writeFile } from "node:fs/promises";

import { Client } from "pg";

import type { Datasource } from "./datasource";
import type { HistoryKind, NotesShape } from "./notes-shape";
import type { Database, HistoryPolicy, RepairOutcome, RepairRun, TableCensus } from "./repair-notes";

import { DatasourceError, assertTargetAllowed, describeDatasource, resolveDatasource } from "./datasource";
import { HISTORY_KINDS, NOTES_SHAPES } from "./notes-shape";
import { NOTES_TABLES, PLAN_KINDS, REPAIR_OUTCOMES, censusNotes, repairAllNotes } from "./repair-notes";

export const USAGE = `Usage: yarn db:repair-notes [--census | --apply [--restore-from-audit | --discard-history]] [options]

Repairs record notes that the old automation appendNote and web form writers stored as a
bare JSON string or as a {message} object instead of a rich-text document.

Modes
  --census                 Count every notes shape per table and judge from AuditLog what the
                           old writers destroyed. Read-only, one consistent snapshot. The default.
  --apply                  Convert bare strings (read as markdown, like the automation note writer)
                           and {message} objects (kept as literal text, like the web form writer)
                           into a document; blank becomes NULL. Valid documents, JSON null and any
                           other value are never touched, and updatedAt is left as it was. A row
                           whose overwritten notes AuditLog can still restore is held back unless
                           one of the two options below says what to do with it. Safe to re-run.
  --restore-from-audit     With --apply: put the overwritten notes back in front of the text.
  --discard-history        With --apply: convert those rows as text alone. Their earlier notes then
                           survive only in AuditLog.

Options
  --company <id>           Only this company (default: every company)
  --batch-size <n>         Rows per batch and per transaction (default 200)
  --report <path>          Also write the per-row findings as JSON (ids only, never note text)
  --allow-remote           Required when the database is not on localhost
  --help                   Print this message

Exit status
  0 done   1 refused or failed (an aborted --apply still prints and reports what it committed)
  2 usage error   3 rows changed meanwhile or locked: run again   4 rows held back for a decision

The database is DIRECT_URL, falling back to DATABASE_URL, as for prisma migrate. When both are
set they must point at the same database. PGHOST, PGPORT, PGDATABASE, PGOPTIONS and the other
libpq routing variables must be unset. Pause automations while --apply runs; it also takes each
company's advisory lock for every batch it writes.
`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const DEFAULT_BATCH_SIZE = 200;
const FLAGS = new Set(["--census", "--apply", "--restore-from-audit", "--discard-history", "--allow-remote", "--help"]);
const OPTIONS_WITH_VALUE = new Set(["--company", "--batch-size", "--report"]);

export const EXIT = { done: 0, failed: 1, usage: 2, retry: 3, decide: 4 } as const;

export type RepairNotesOptions = {
  mode: "census" | "apply";
  history: HistoryPolicy;
  companyId?: string;
  batchSize: number;
  reportPath?: string;
  allowRemote: boolean;
  help: boolean;
};

export type Output = { write: (text: string) => void; error: (text: string) => void };

export type Session = { db: Database; close: () => Promise<void> };

export type OpenSession = (datasource: Datasource) => Promise<Session>;

export class UsageError extends Error {}

function readArguments(argv: readonly string[]): Map<string, string> {
  const parsed = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const inline = token.indexOf("=");
    const name = inline > 0 ? token.slice(0, inline) : token;

    if (FLAGS.has(name) && inline < 0) parsed.set(name, "true");
    else if (OPTIONS_WITH_VALUE.has(name)) {
      const value = inline > 0 ? token.slice(inline + 1) : argv[(index += 1)];
      if (value === undefined || value.trim() === "" || value.startsWith("--"))
        throw new UsageError(`${name} needs a value.`);
      parsed.set(name, value.trim());
    } else throw new UsageError(`Unknown argument "${token}".`);
  }

  return parsed;
}

export function parseArguments(argv: readonly string[]): RepairNotesOptions {
  const parsed = readArguments(argv);
  const restore = parsed.has("--restore-from-audit");
  const discard = parsed.has("--discard-history");

  if (parsed.has("--census") && parsed.has("--apply")) throw new UsageError("Choose one of --census and --apply.");
  if ((restore || discard) && !parsed.has("--apply"))
    throw new UsageError("--restore-from-audit and --discard-history only take effect with --apply.");
  if (restore && discard) throw new UsageError("Choose one of --restore-from-audit and --discard-history.");

  const companyId = parsed.get("--company")?.toLowerCase();
  if (companyId !== undefined && !UUID.test(companyId)) throw new UsageError("--company expects a company id (uuid).");

  const batchSize = parsed.has("--batch-size") ? Number(parsed.get("--batch-size")) : DEFAULT_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize <= 0) throw new UsageError("--batch-size expects a positive integer.");

  return {
    mode: parsed.has("--apply") ? "apply" : "census",
    history: restore ? "restore" : discard ? "discard" : "hold",
    companyId,
    batchSize,
    reportPath: parsed.get("--report"),
    allowRemote: parsed.has("--allow-remote"),
    help: parsed.has("--help"),
  };
}

function renderTable(headers: readonly string[], rows: ReadonlyArray<readonly (string | number)[]>): string {
  const cells = [headers, ...rows].map((row) => row.map(String));
  const widths = headers.map((_, column) => Math.max(...cells.map((row) => row[column].length)));

  return cells
    .map((row) =>
      row
        .map((cell, column) => (column === 0 ? cell.padEnd(widths[column]) : cell.padStart(widths[column])))
        .join("  "),
    )
    .join("\n");
}

function withTotal<K extends string>(
  entries: ReadonlyArray<{ table: string; counts: Record<K, number> }>,
  keys: readonly K[],
): Array<Array<string | number>> {
  const rows = entries.map(({ table, counts }) => [table, ...keys.map((key) => counts[key])]);
  const totals = keys.map((key) => entries.reduce((sum, entry) => sum + entry.counts[key], 0));

  return [...rows, ["all", ...totals]];
}

const SHAPE_HEADERS: Record<NotesShape, string> = {
  string: "string",
  message: "{message}",
  doc: "doc",
  other: "other",
  jsonNull: "json null",
  sqlNull: "sql null",
};

const PLAN_HEADERS: Record<(typeof PLAN_KINDS)[number], string> = {
  convert: "convert",
  clear: "clear",
  unreadable: "unreadable",
  oversize: "of which oversize",
};

const HISTORY_HEADERS: Record<HistoryKind, string> = {
  noHistory: "no history",
  nothingLost: "nothing lost",
  recoverable: "recoverable",
  unreadableHistory: "unreadable history",
};

const OUTCOME_HEADERS: Record<RepairOutcome, string> = {
  converted: "converted",
  restored: "restored",
  cleared: "cleared",
  held: "held",
  unreadable: "unreadable",
  changed: "changed meanwhile",
  locked: "locked",
};

const OVERSIZE_NOTE =
  "oversize: longer than the app accepts (65,535 characters of text or 262,144 of document); it is still converted,\n" +
  "but the next save of that record's notes will fail until someone shortens them.";

function describeScope(options: RepairNotesOptions): string {
  return options.companyId ? `Scope: company ${options.companyId}` : "Scope: every company";
}

export function renderCensus(censuses: readonly TableCensus[], options: RepairNotesOptions): string {
  const shapeRows = censuses.map((census) => ({
    table: census.table,
    counts: { total: census.total, ...census.shapes },
  }));
  const untouched = censuses.reduce((sum, census) => sum + census.shapes.other + census.plan.unreadable, 0);

  return [
    "Mode: census (read-only)",
    describeScope(options),
    "",
    "Notes shapes",
    renderTable(
      ["table", "total", ...NOTES_SHAPES.map((shape) => SHAPE_HEADERS[shape])],
      withTotal(shapeRows, ["total", ...NOTES_SHAPES] as const),
    ),
    "",
    "What --apply would do to bare strings and {message} objects",
    renderTable(
      ["table", ...PLAN_KINDS.map((kind) => PLAN_HEADERS[kind])],
      withTotal(
        censuses.map((census) => ({ table: census.table, counts: census.plan })),
        PLAN_KINDS,
      ),
    ),
    OVERSIZE_NOTE,
    "",
    "What the old writers destroyed, judged from AuditLog (bare strings --apply would write)",
    renderTable(
      ["table", ...HISTORY_KINDS.map((kind) => HISTORY_HEADERS[kind])],
      withTotal(
        censuses.map((census) => ({ table: census.table, counts: census.history })),
        HISTORY_KINDS,
      ),
    ),
    "",
    "  nothing lost        the text is all the record ever held, so --apply loses nothing",
    "  recoverable         AuditLog holds notes the automation overwrote. --apply holds these rows back unless you",
    "                      add --restore-from-audit (puts the notes back) or --discard-history (text alone)",
    "  no history          AuditLog shows nothing earlier; only a point-in-time restore can tell what was there",
    "  unreadable history  the last snapshot before the text is not a readable document; --apply keeps the text only",
    "",
    `${untouched} row(s) hold a value --apply leaves alone: an unreadable document, some other object or scalar,`,
    "or a string holding an unreadable document. --report <path> lists the id of every row that is not a document.",
    "",
  ].join("\n");
}

export function renderRepair(run: RepairRun, options: RepairNotesOptions): string {
  const sum = (count: (table: RepairRun["tables"][number]) => number) =>
    run.tables.reduce((total, table) => total + count(table), 0);
  const written = sum((table) => table.outcomes.converted + table.outcomes.restored + table.outcomes.cleared);
  const held = sum((table) => table.outcomes.held);
  const retry = sum((table) => table.outcomes.changed + table.outcomes.locked);
  const discarded = sum((table) => table.discarded);
  const oversize = sum((table) => table.oversize);

  const policy = {
    hold: "",
    restore: ", restoring overwritten notes from AuditLog",
    discard: ", discarding overwritten notes AuditLog could restore",
  }[options.history];

  const lines = [
    `Mode: apply${policy}`,
    describeScope(options),
    "",
    renderTable(
      ["table", ...REPAIR_OUTCOMES.map((outcome) => OUTCOME_HEADERS[outcome]), "oversize"],
      withTotal(
        run.tables.map((table) => ({ table: table.table, counts: { ...table.outcomes, oversize: table.oversize } })),
        [...REPAIR_OUTCOMES, "oversize"] as const,
      ),
    ),
    "",
    `Wrote ${written} row(s). Unreadable rows were left as they are.`,
  ];

  if (held > 0) {
    lines.push(
      `${held} row(s) held back: AuditLog still holds the notes an automation overwrote on them. Run again with`,
      "--restore-from-audit to put those notes back, or --discard-history to convert the text alone.",
    );
  }
  if (discarded > 0) {
    lines.push(
      `${discarded} recoverable row(s) converted without restoring; --report lists them (history recoverable).`,
    );
  }
  if (retry > 0) lines.push(`${retry} row(s) changed meanwhile or locked by the app; run again to pick them up.`);
  if (oversize > 0) lines.push(OVERSIZE_NOTE);
  if (run.aborted) {
    const unreached = NOTES_TABLES.filter(({ table }) => !run.tables.some((entry) => entry.table === table));
    lines.push(
      `ABORTED in ${run.aborted.table}: ${run.aborted.message}`,
      "Batches committed before the failure stay committed and are counted above; the failing batch was rolled back.",
      `Tables not reached: ${unreached.map(({ table }) => table).join(", ") || "none"}. Run again to continue.`,
    );
  }
  lines.push("Then run --census: string and {message} should count only unreadable and held rows.", "");

  return lines.join("\n");
}

export function exitCodeOf(run: RepairRun): number {
  if (run.aborted) return EXIT.failed;

  const count = (outcome: RepairOutcome) => run.tables.reduce((total, table) => total + table.outcomes[outcome], 0);
  if (count("changed") + count("locked") > 0) return EXIT.retry;
  if (count("held") > 0) return EXIT.decide;

  return EXIT.done;
}

function reportOf(datasource: Datasource, options: RepairNotesOptions, extra: Record<string, unknown>): string {
  return `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      datasource: {
        variable: datasource.variable,
        host: datasource.host,
        port: datasource.port,
        database: datasource.database,
      },
      mode: options.mode,
      history: options.mode === "apply" ? options.history : null,
      companyId: options.companyId ?? null,
      ...extra,
    },
    null,
    2,
  )}\n`;
}

async function runCensus(db: Database, datasource: Datasource, options: RepairNotesOptions, output: Output) {
  const scope = { companyId: options.companyId, batchSize: options.batchSize };

  await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  let censuses: TableCensus[];
  try {
    censuses = await censusNotes(db, scope);
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }

  output.write(renderCensus(censuses, options));
  if (options.reportPath)
    await writeFile(options.reportPath, reportOf(datasource, options, { tables: censuses }), "utf8");

  return EXIT.done;
}

async function runApply(db: Database, datasource: Datasource, options: RepairNotesOptions, output: Output) {
  const run = await repairAllNotes(db, {
    companyId: options.companyId,
    batchSize: options.batchSize,
    history: options.history,
  });

  output.write(renderRepair(run, options));
  if (options.reportPath) {
    const extra = { aborted: run.aborted !== null, error: run.aborted, tables: run.tables };
    await writeFile(options.reportPath, reportOf(datasource, options, extra), "utf8");
  }

  return exitCodeOf(run);
}

export const openPostgres: OpenSession = async (datasource) => {
  const client = new Client({ ...datasource.connection, application_name: "repair-notes" });
  await client.connect();
  await client.query("SET lock_timeout = '10s'");

  return { db: client, close: () => client.end() };
};

export async function runRepairNotes(
  argv: readonly string[],
  environment: Record<string, string | undefined>,
  output: Output,
  open: OpenSession = openPostgres,
): Promise<number> {
  let options: RepairNotesOptions;
  let datasource: Datasource;

  try {
    options = parseArguments(argv);
    if (options.help) {
      output.write(USAGE);
      return EXIT.done;
    }

    datasource = resolveDatasource(environment);
    output.write(`${describeDatasource(datasource)}\n`);
    assertTargetAllowed(datasource, options.allowRemote);
  } catch (error) {
    if (error instanceof UsageError) {
      output.error(`${error.message}\n\n${USAGE}`);
      return EXIT.usage;
    }
    if (error instanceof DatasourceError) {
      output.error(`${error.message}\n`);
      return EXIT.failed;
    }
    throw error;
  }

  const session = await open(datasource);
  try {
    return options.mode === "census"
      ? await runCensus(session.db, datasource, options, output)
      : await runApply(session.db, datasource, options, output);
  } finally {
    await session.close();
  }
}
