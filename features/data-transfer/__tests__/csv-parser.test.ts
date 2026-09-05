import { describe, expect, it } from "vitest";

import {
  detectDelimiter,
  detectHeaderIndex,
  parseDelimitedText,
  readDelimitedTable,
  stripByteOrderMark,
} from "../import/csv-parser";

const BOM = "\uFEFF";

describe("parseDelimitedText", () => {
  it("keeps a comma that lives inside a quoted field", () => {
    expect(parseDelimitedText('name,notes\nAda,"Lovelace, Ada"\n', ",")).toEqual([
      ["name", "notes"],
      ["Ada", "Lovelace, Ada"],
    ]);
  });

  it("unescapes a doubled quote inside a quoted field", () => {
    expect(parseDelimitedText('a\n"She said ""hi"""\n', ",")).toEqual([["a"], ['She said "hi"']]);
  });

  it("keeps a newline that lives inside a quoted field on one record", () => {
    const records = parseDelimitedText('name,notes\nAda,"first\r\nsecond"\nGrace,plain\n', ",");

    expect(records).toEqual([
      ["name", "notes"],
      ["Ada", "first\r\nsecond"],
      ["Grace", "plain"],
    ]);
  });

  it("reads CRLF, LF and a file with no trailing newline the same way", () => {
    const expected = [
      ["a", "b"],
      ["1", "2"],
    ];

    expect(parseDelimitedText("a,b\r\n1,2\r\n", ",")).toEqual(expected);
    expect(parseDelimitedText("a,b\n1,2\n", ",")).toEqual(expected);
    expect(parseDelimitedText("a,b\n1,2", ",")).toEqual(expected);
  });

  it("keeps a blank line as its own record so later records keep their line number", () => {
    expect(parseDelimitedText("a,b\n\n1,2\n", ",")).toEqual([["a", "b"], [""], ["1", "2"]]);
  });

  it("keeps the empty field a trailing delimiter produces", () => {
    expect(parseDelimitedText("a,b,\n", ",")).toEqual([["a", "b", ""]]);
  });

  it("strips a byte order mark before the first header cell", () => {
    expect(parseDelimitedText(stripByteOrderMark(`${BOM}name,notes\n`), ",")).toEqual([["name", "notes"]]);
  });
});

describe("detectDelimiter", () => {
  it("picks the semicolon of a German export whose text is full of commas", () => {
    const text = [
      "Name;Notizen;Betrag",
      "Ada;Rechnung, Mahnung, Angebot;100",
      "Grace;Angebot, Vertrag;200",
      "Alan;Vertrag, Rechnung;300",
    ].join("\n");

    expect(detectDelimiter(text)).toBe(";");
  });

  it("picks the semicolon even when the commas hide inside quoted fields", () => {
    const text = [
      "Name;Notizen;Betrag",
      'Ada;"Lovelace, Ada";100',
      'Grace;"Hopper, Grace";200',
      'Alan;"Turing, Alan";300',
    ].join("\r\n");

    expect(detectDelimiter(text)).toBe(";");
  });

  it("still picks the comma of an ordinary comma file", () => {
    expect(detectDelimiter("first,last,notes\nAda,Lovelace,none\nGrace,Hopper,none\n")).toBe(",");
  });

  it("picks the tab of a tab separated file", () => {
    expect(detectDelimiter("first\tlast\nAda\tLovelace\nGrace\tHopper\n")).toBe("\t");
  });

  it("picks the pipe of a pipe separated file", () => {
    expect(detectDelimiter("first|last\nAda|Lovelace\nGrace|Hopper\n")).toBe("|");
  });

  it("prefers the delimiter that keeps the field count stable over the more frequent character", () => {
    const text = ["a;b;c;d", "1,1,1;2;3;4", "5,5,5;6;7;8", "9,9,9;10;11;12"].join("\n");

    expect(detectDelimiter(text)).toBe(";");
  });

  it("falls back to the comma when no delimiter splits the text", () => {
    expect(detectDelimiter("just one column\nvalue\nother\n")).toBe(",");
  });
});

describe("detectHeaderIndex", () => {
  it("finds the header under a preamble line of a different width", () => {
    const records = parseDelimitedText("Export 2026-01-01\n\nfirst,last,notes\nAda,Lovelace,none\n", ",");

    expect(detectHeaderIndex(records)).toBe(2);
  });

  it("uses the first record when the file starts with its header", () => {
    expect(detectHeaderIndex(parseDelimitedText("first,last\nAda,Lovelace\n", ","))).toBe(0);
  });

  it("skips a leading record whose cells are all numbers", () => {
    const records = parseDelimitedText("1,2\nfirst,last\nAda,Lovelace\n", ",");

    expect(detectHeaderIndex(records)).toBe(1);
  });
});

describe("readDelimitedTable", () => {
  it("numbers rows against the real line in the file, not against the header", () => {
    const table = readDelimitedTable(`${BOM}Export of deals\n\nname;amount\nAda;100\nGrace;200\n`);

    expect(table.delimiter).toBe(";");
    expect(table.headerRecord).toBe(3);
    expect(table.header).toEqual(["name", "amount"]);
    expect(table.rows).toEqual([
      { record: 4, cells: ["Ada", "100"] },
      { record: 5, cells: ["Grace", "200"] },
    ]);
  });

  it("drops a blank row without renumbering the rows that follow it", () => {
    const table = readDelimitedTable("name,amount\nAda,100\n\nGrace,200\n");

    expect(table.rows.map((row) => row.record)).toEqual([2, 4]);
  });
});

describe("detectHeaderIndex width", () => {
  it("keeps a header row narrower than the widest data row", () => {
    const records = [
      ["Name", "Email"],
      ["Ada", "ada@example.com", "extra"],
      ["Grace", "grace@example.com", "extra"],
    ];

    expect(detectHeaderIndex(records)).toBe(0);
  });

  it("skips a one cell preamble line above the header", () => {
    const records = [["Exported from somewhere"], ["Name", "Email"], ["Ada", "ada@example.com"]];

    expect(detectHeaderIndex(records)).toBe(1);
  });
});
