"use client";

import type { ParsedWorkbook } from "./read-workbook-file";

import { ImportFileError, readWorkbookFile } from "./read-workbook-file";
import { readCsvFile } from "./read-csv-file";

export const WORKBOOK_IMPORT_EXTENSIONS: readonly string[] = [".xlsx"];

export const DELIMITED_IMPORT_EXTENSIONS: readonly string[] = [".csv", ".tsv", ".txt"];

export const IMPORT_FILE_ACCEPT = [...WORKBOOK_IMPORT_EXTENSIONS, ...DELIMITED_IMPORT_EXTENSIONS].join(",");

export function importFileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");

  return dot === -1 ? "" : fileName.slice(dot).toLocaleLowerCase();
}

export async function readImportFile(file: File): Promise<ParsedWorkbook> {
  const extension = importFileExtension(file.name);

  if (WORKBOOK_IMPORT_EXTENSIONS.includes(extension)) return readWorkbookFile(file);
  if (DELIMITED_IMPORT_EXTENSIONS.includes(extension)) return readCsvFile(file);

  throw new ImportFileError("unreadable");
}
