import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { EntityType } from "@/generated/prisma";

import { IMPORT_ENTITIES } from "../import/import-entity.registry";
import { ImportFileError } from "../import/read-workbook-file";
import { autoMatchColumns, mappingFromSchemaSheet } from "../import/import-mapping";
import { buildPlan } from "../import/import-plan";
import { IMPORT_FILE_ACCEPT, readImportFile } from "../import/read-import-file";

const CONTACTS = IMPORT_ENTITIES[EntityType.contact];

function csvFile(text: string, name = "contacts.csv"): File {
  return new File([text], name);
}

async function workbookFile(): Promise<File> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Kontakte");

  const header = sheet.getRow(1);
  header.getCell(1).value = "Vorname";
  header.getCell(2).value = "Nachname";

  const row = sheet.getRow(2);
  row.getCell(1).value = "Ada";
  row.getCell(2).value = "Lovelace";

  return new File([await workbook.xlsx.writeBuffer()], "book.xlsx");
}

describe("readImportFile", () => {
  it("offers the delimited extensions alongside the workbook one", () => {
    expect(IMPORT_FILE_ACCEPT).toBe(".xlsx,.csv,.tsv,.txt");
  });

  it("still reads a workbook through the untouched xlsx reader", async () => {
    const parsed = await readImportFile(await workbookFile());

    expect(parsed.sheetName).toBe("Kontakte");
    expect(parsed.sources.map((source) => source.header)).toEqual(["Vorname", "Nachname"]);
    expect(parsed.rows).toHaveLength(1);
  });

  it("returns the same parsed shape for a CSV, with no schema sheet and no relation sheets", async () => {
    const parsed = await readImportFile(csvFile("first,last\nAda,Lovelace\n"));

    expect(parsed.schemaRows).toEqual([]);
    expect(parsed.relationSheets).toEqual({});
    expect(parsed.sources.map((source) => [source.letter, source.header])).toEqual([
      ["A", "first"],
      ["B", "last"],
    ]);
    expect(parsed.rows).toEqual([{ sourceIndex: 0, sheetRow: 2, cells: ["Ada", "Lovelace"] }]);
  });

  it("collects samples for the mapping step the way the workbook reader does", async () => {
    const parsed = await readImportFile(csvFile("first,last\nAda,Lovelace\nGrace,Hopper\n"));

    expect(parsed.sources.map((source) => source.samples)).toEqual([
      ["Ada", "Grace"],
      ["Lovelace", "Hopper"],
    ]);
  });

  it("reads a semicolon file whose quoted fields carry commas, and numbers rows from the real line", async () => {
    const text = [
      "Kundenexport 2026-01-01",
      "",
      "Vorname;Nachname;Notizen",
      'Ada;Lovelace;"Rechnung, Mahnung"',
      'Grace;Hopper;"Vertrag, Angebot"',
    ].join("\r\n");

    const parsed = await readImportFile(csvFile(text, "kontakte.csv"));

    expect(parsed.sources.map((source) => source.header)).toEqual(["Vorname", "Nachname", "Notizen"]);
    expect(parsed.rows).toEqual([
      { sourceIndex: 0, sheetRow: 4, cells: ["Ada", "Lovelace", "Rechnung, Mahnung"] },
      { sourceIndex: 1, sheetRow: 5, cells: ["Grace", "Hopper", "Vertrag, Angebot"] },
    ]);
  });

  it("plans a semicolon file through header auto-matching, since a CSV carries no schema sheet", async () => {
    const text = [
      "First Name;Last Name;Notes;Email",
      'Ada;Lovelace;"Rechnung, Mahnung";ada@example.com',
      'Grace;Hopper;"Vertrag, Angebot";grace@example.com',
    ].join("\n");

    const parsed = await readImportFile(csvFile(text));

    expect(mappingFromSchemaSheet(parsed.sources, parsed.schemaRows, CONTACTS, [])).toBeNull();

    const mapping = autoMatchColumns(parsed.sources, CONTACTS, []);

    expect(mapping).toEqual([
      { kind: "field", key: "firstName" },
      { kind: "field", key: "lastName" },
      { kind: "field", key: "notes" },
      { kind: "identifier", provider: "mail" },
    ]);

    const plan = buildPlan({
      rows: parsed.rows,
      sources: parsed.sources,
      mapping,
      descriptor: CONTACTS,
      customColumns: [],
      relationIndex: {},
    });

    expect(plan.issues).toEqual([]);
    expect(plan.create.map((row) => row.payload)).toEqual([
      {
        firstName: "Ada",
        lastName: "Lovelace",
        notes: "Rechnung, Mahnung",
        identifiers: [{ provider: "mail", value: "ada@example.com" }],
      },
      {
        firstName: "Grace",
        lastName: "Hopper",
        notes: "Vertrag, Angebot",
        identifiers: [{ provider: "mail", value: "grace@example.com" }],
      },
    ]);
  });

  it("reads the umlauts of a legacy Excel export that was never written as UTF-8", async () => {
    const latin1 = Buffer.from("Vorname;Nachname\r\nJürgen;Müller\r\n", "latin1");
    const parsed = await readImportFile(new File([latin1], "kontakte.csv"));

    expect(parsed.sources.map((source) => source.header)).toEqual(["Vorname", "Nachname"]);
    expect(parsed.rows[0].cells).toEqual(["Jürgen", "Müller"]);
  });

  it("rejects a file whose extension belongs to neither reader", async () => {
    await expect(readImportFile(csvFile("first,last\nAda,Lovelace\n", "contacts.pdf"))).rejects.toThrow(
      ImportFileError,
    );
  });

  it("rejects a delimited file that carries a header and nothing else", async () => {
    await expect(readImportFile(csvFile("first,last\n"))).rejects.toMatchObject({ reason: "empty" });
  });
});
