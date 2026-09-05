import type { ImportRowIssue } from "../import/import-issues";
import type { IssueReportLabels } from "../import/issue-report";

import { describe, expect, it } from "vitest";

import { buildIssueReportCsv, csvText, issueReportEntries, issueReportFileName } from "../import/issue-report";

const LABELS: IssueReportLabels = {
  row: "Row",
  column: "Column",
  header: "Column header",
  value: "Value",
  message: "Problem",
  blocking: "Blocks the row",
  blockingYes: "Yes",
  blockingNo: "No",
};

function issue(overrides: Partial<ImportRowIssue> = {}): ImportRowIssue {
  return {
    sheetRow: 4,
    columnLetter: "B",
    columnLabel: "Amount",
    fieldPath: "amount",
    message: "",
    values: { value: "n/a" },
    code: "notANumber",
    blocking: true,
    ...overrides,
  };
}

const SOURCES = [
  { index: 0, letter: "A", header: "Name", samples: [] },
  { index: 1, letter: "B", header: "Amount", samples: [] },
];

describe("issue report entries", () => {
  it("carries the already-translated message through untouched", () => {
    const entries = issueReportEntries({
      issues: [issue()],
      sources: SOURCES,
      rows: [],
      messageOf: () => '"n/a" is not a number',
    });

    expect(entries).toEqual([
      {
        sheetRow: 4,
        columnLetter: "B",
        columnLabel: "Amount",
        value: "n/a",
        message: '"n/a" is not a number',
        blocking: true,
      },
    ]);
  });

  it("falls back to the cell the server complained about, so a schema rejection still names a value", () => {
    const entries = issueReportEntries({
      issues: [issue({ values: null, message: "expected string, received undefined", code: "invalid_type" })],
      sources: SOURCES,
      rows: [{ sourceIndex: 2, sheetRow: 4, cells: ["Ada", "  1.000  "] }],
      messageOf: (found) => found.message,
    });

    expect(entries[0].value).toBe("1.000");
  });

  it("leaves the value empty when nothing can be blamed for it", () => {
    const entries = issueReportEntries({
      issues: [issue({ sheetRow: null, columnLetter: null, columnLabel: null, values: null, message: "no rows" })],
      sources: SOURCES,
      rows: [],
      messageOf: (found) => found.message,
    });

    expect(entries[0]).toMatchObject({ sheetRow: null, columnLetter: null, value: "" });
  });

  it("orders the report by sheet row so it reads like the file", () => {
    const entries = issueReportEntries({
      issues: [issue({ sheetRow: 9 }), issue({ sheetRow: 3 }), issue({ sheetRow: 6 })],
      sources: SOURCES,
      rows: [],
      messageOf: () => "bad",
    });

    expect(entries.map((entry) => entry.sheetRow)).toEqual([3, 6, 9]);
  });
});

describe("issue report csv", () => {
  it("writes one record per problem behind a header row", () => {
    const csv = buildIssueReportCsv(
      [
        {
          sheetRow: 4,
          columnLetter: "B",
          columnLabel: "Amount",
          value: "n/a",
          message: "not a number",
          blocking: true,
        },
        {
          sheetRow: 7,
          columnLetter: "D",
          columnLabel: "Mobil",
          value: "hello",
          message: "not a phone",
          blocking: false,
        },
      ],
      LABELS,
    );

    expect(csv.split("\r\n")).toEqual([
      "Row,Column,Column header,Value,Problem,Blocks the row",
      "4,B,Amount,n/a,not a number,Yes",
      "7,D,Mobil,hello,not a phone,No",
    ]);
  });

  it("quotes a value that carries the delimiter, a quote or a newline, so the file stays one column per field", () => {
    const csv = buildIssueReportCsv(
      [
        {
          sheetRow: 2,
          columnLetter: "A",
          columnLabel: "Notes",
          value: 'Rechnung, "Mahnung"\nzweite Zeile',
          message: "too long",
          blocking: true,
        },
      ],
      LABELS,
    );

    expect(csv.split("\r\n")[1]).toBe('2,A,Notes,"Rechnung, ""Mahnung""\nzweite Zeile",too long,Yes');
  });

  it("leaves the row number empty for a problem that belongs to no row", () => {
    const csv = buildIssueReportCsv(
      [{ sheetRow: null, columnLetter: null, columnLabel: null, value: "", message: "lookup failed", blocking: true }],
      LABELS,
    );

    expect(csv.split("\r\n")[1]).toBe(",,,,lookup failed,Yes");
  });

  it("escapes a semicolon as well, so a German spreadsheet does not split the message", () => {
    expect(csvText([["a;b", "c"]])).toBe('"a;b",c');
  });
});

describe("issue report file name", () => {
  it("names the report after the file the problems came from", () => {
    expect(issueReportFileName("kontakte.csv")).toBe("kontakte-import-issues.csv");
    expect(issueReportFileName("deals.xlsx")).toBe("deals-import-issues.csv");
  });

  it("still has a name when the wizard has no file name", () => {
    expect(issueReportFileName("")).toBe("import-issues.csv");
  });
});
