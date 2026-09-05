"use client";

import type { ParsedWorkbook } from "./read-workbook-file";
import type { SourceColumn } from "./import-mapping";
import type { SourceRow } from "./import-plan";

import { IMPORT_ROW_LIMIT } from "../data-transfer.schema";
import { columnLetter } from "./import-mapping";
import { fromWorkbookCell } from "../workbook-cell";
import { ImportFileError, MAX_IMPORT_FILE_BYTES } from "./read-workbook-file";
import { readDelimitedTable } from "./csv-parser";

const SAMPLE_SOURCE_ROWS = 20;

const SAMPLES_PER_COLUMN = 3;

const REPLACEMENT_CHARACTER = "\uFFFD";

const LEGACY_SPREADSHEET_ENCODING = "windows-1252";

export function decodeDelimitedText(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  if (!utf8.includes(REPLACEMENT_CHARACTER)) return utf8;

  try {
    return new TextDecoder(LEGACY_SPREADSHEET_ENCODING).decode(buffer);
  } catch {
    return utf8;
  }
}

function tableNameOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");

  return dot <= 0 ? fileName : fileName.slice(0, dot);
}

export async function readCsvFile(file: File): Promise<ParsedWorkbook> {
  if (file.size > MAX_IMPORT_FILE_BYTES) throw new ImportFileError("tooLarge");

  let text: string;

  try {
    text = decodeDelimitedText(await file.arrayBuffer());
  } catch {
    throw new ImportFileError("unreadable");
  }

  const table = readDelimitedTable(text);

  if (table.header.length === 0 || table.rows.length === 0) throw new ImportFileError("empty");
  if (table.rows.length > IMPORT_ROW_LIMIT) throw new ImportFileError("tooManyRows");

  const width = table.rows.reduce((widest, row) => Math.max(widest, row.cells.length), table.header.length);

  const sources: SourceColumn[] = Array.from({ length: width }, (_, index) => ({
    index,
    letter: columnLetter(index),
    header: String(fromWorkbookCell(table.header[index] ?? "") ?? ""),
    samples: [],
  }));

  const rows: SourceRow[] = table.rows.map((row, index) => ({
    sourceIndex: index,
    sheetRow: row.record,
    cells: sources.map((source) => fromWorkbookCell(row.cells[source.index] ?? "")),
  }));

  for (const source of sources) {
    source.samples = rows
      .slice(0, SAMPLE_SOURCE_ROWS)
      .map((row) => row.cells[source.index])
      .filter((cell): cell is string => typeof cell === "string" && cell.length > 0)
      .slice(0, SAMPLES_PER_COLUMN);
  }

  return { sheetName: tableNameOf(file.name), sources, rows, schemaRows: [], relationSheets: {} };
}
