import type { ImportRowIssue } from "./import-issues";
import type { SourceColumn } from "./import-mapping";
import type { SourceRow } from "./import-plan";

import { asText } from "./import-plan";

export type IssueReportLabels = {
  row: string;
  column: string;
  header: string;
  value: string;
  message: string;
  blocking: string;
  blockingYes: string;
  blockingNo: string;
};

export type IssueReportEntry = {
  sheetRow: number | null;
  columnLetter: string | null;
  columnLabel: string | null;
  value: string;
  message: string;
  blocking: boolean;
};

const REPORT_FILE_SUFFIX = "-import-issues.csv";

const REPORT_FILE_FALLBACK = "import-issues.csv";

const QUOTED_FIELD_PATTERN = /["\r\n,;]/;

const RECORD_SEPARATOR = "\r\n";

const FIELD_SEPARATOR = ",";

export function csvField(value: string): string {
  return QUOTED_FIELD_PATTERN.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function csvText(records: string[][]): string {
  return records.map((record) => record.map(csvField).join(FIELD_SEPARATOR)).join(RECORD_SEPARATOR);
}

function valueOfIssue(issue: ImportRowIssue, cellAt: (sheetRow: number, letter: string) => string): string {
  const reported = issue.values?.value;
  if (reported !== undefined) return String(reported);

  return issue.sheetRow !== null && issue.columnLetter !== null ? cellAt(issue.sheetRow, issue.columnLetter) : "";
}

export function issueReportEntries(args: {
  issues: ImportRowIssue[];
  sources: SourceColumn[];
  rows: SourceRow[];
  messageOf: (issue: ImportRowIssue) => string;
}): IssueReportEntry[] {
  const indexByLetter = new Map(args.sources.map((source) => [source.letter, source.index]));
  const cellsBySheetRow = new Map(args.rows.map((row) => [row.sheetRow, row.cells]));

  const cellAt = (sheetRow: number, letter: string) => {
    const index = indexByLetter.get(letter);
    if (index === undefined) return "";

    return asText(cellsBySheetRow.get(sheetRow)?.[index] ?? null);
  };

  return args.issues
    .map((issue) => ({
      sheetRow: issue.sheetRow,
      columnLetter: issue.columnLetter,
      columnLabel: issue.columnLabel,
      value: valueOfIssue(issue, cellAt),
      message: args.messageOf(issue),
      blocking: issue.blocking,
    }))
    .sort((left, right) => (left.sheetRow ?? 0) - (right.sheetRow ?? 0));
}

export function buildIssueReportCsv(entries: IssueReportEntry[], labels: IssueReportLabels): string {
  const header = [labels.row, labels.column, labels.header, labels.value, labels.message, labels.blocking];

  const records = entries.map((entry) => [
    entry.sheetRow === null ? "" : String(entry.sheetRow),
    entry.columnLetter ?? "",
    entry.columnLabel ?? "",
    entry.value,
    entry.message,
    entry.blocking ? labels.blockingYes : labels.blockingNo,
  ]);

  return csvText([header, ...records]);
}

export function issueReportFileName(sourceName: string): string {
  const base = sourceName.replace(/\.[^.]+$/, "").trim();

  return base.length === 0 ? REPORT_FILE_FALLBACK : `${base}${REPORT_FILE_SUFFIX}`;
}
