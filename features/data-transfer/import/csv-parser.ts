export const CSV_DELIMITERS: readonly string[] = [",", ";", "\t", "|"];

const BYTE_ORDER_MARK = "\uFEFF";

const QUOTE = '"';

const DELIMITER_SAMPLE_RECORDS = 20;

const DELIMITER_SCAN_RECORDS = 100;

const HEADER_SEARCH_RECORDS = 10;

const NUMERIC_CELL = /^[+-]?[\d\s.,]+$/;

export type DelimitedRow = { record: number; cells: string[] };

export type DelimitedTable = {
  delimiter: string;
  headerRecord: number;
  header: string[];
  rows: DelimitedRow[];
};

export function stripByteOrderMark(text: string): string {
  return text.startsWith(BYTE_ORDER_MARK) ? text.slice(BYTE_ORDER_MARK.length) : text;
}

export function parseDelimitedText(
  text: string,
  delimiter: string,
  recordLimit = Number.POSITIVE_INFINITY,
): string[][] {
  const records: string[][] = [];
  let cells: string[] = [];
  let field = "";
  let quoted = false;
  let position = 0;

  const endRecord = () => {
    cells.push(field);
    records.push(cells);
    cells = [];
    field = "";
  };

  while (position < text.length && records.length < recordLimit) {
    const char = text[position];

    if (quoted) {
      if (char !== QUOTE) {
        field += char;
        position += 1;
      } else if (text[position + 1] === QUOTE) {
        field += QUOTE;
        position += 2;
      } else {
        quoted = false;
        position += 1;
      }

      continue;
    }

    if (char === QUOTE && field.length === 0) {
      quoted = true;
      position += 1;
      continue;
    }

    if (char === delimiter) {
      cells.push(field);
      field = "";
      position += 1;
      continue;
    }

    if (char === "\n" || char === "\r") {
      position += char === "\r" && text[position + 1] === "\n" ? 2 : 1;
      endRecord();
      continue;
    }

    field += char;
    position += 1;
  }

  if (records.length < recordLimit && (field.length > 0 || cells.length > 0)) endRecord();

  return records;
}

export function isBlankRecord(cells: string[]): boolean {
  return cells.every((cell) => cell.trim().length === 0);
}

type FieldCountShape = { width: number; matching: number; total: number };

function fieldCountShape(records: string[][]): FieldCountShape {
  const timesByCount = new Map<number, number>();

  for (const cells of records) timesByCount.set(cells.length, (timesByCount.get(cells.length) ?? 0) + 1);

  let width = 0;
  let matching = 0;

  for (const [count, times] of timesByCount) {
    if (times > matching || (times === matching && count > width)) {
      width = count;
      matching = times;
    }
  }

  return { width, matching, total: records.length };
}

function sampleShape(text: string, delimiter: string): FieldCountShape {
  const records = parseDelimitedText(text, delimiter, DELIMITER_SCAN_RECORDS)
    .filter((cells) => !isBlankRecord(cells))
    .slice(0, DELIMITER_SAMPLE_RECORDS);

  return fieldCountShape(records);
}

export function delimiterConsistency(shape: FieldCountShape): number {
  if (shape.total === 0 || shape.width < 2) return 0;

  return shape.matching / shape.total;
}

export function detectDelimiter(text: string): string {
  let chosen = CSV_DELIMITERS[0];
  let chosenConsistency = 0;
  let chosenWidth = 0;

  for (const delimiter of CSV_DELIMITERS) {
    const shape = sampleShape(text, delimiter);
    const consistency = delimiterConsistency(shape);
    if (consistency === 0) continue;

    if (consistency > chosenConsistency || (consistency === chosenConsistency && shape.width > chosenWidth)) {
      chosen = delimiter;
      chosenConsistency = consistency;
      chosenWidth = shape.width;
    }
  }

  return chosen;
}

function readsAsText(cells: string[]): boolean {
  return cells.every((cell) => cell.trim().length === 0 || !NUMERIC_CELL.test(cell.trim()));
}

export function detectHeaderIndex(records: string[][]): number {
  const sample = records.filter((cells) => !isBlankRecord(cells)).slice(0, DELIMITER_SAMPLE_RECORDS);
  const width = fieldCountShape(sample).width;

  const candidates = records
    .slice(0, HEADER_SEARCH_RECORDS)
    .flatMap((cells, index) => (!isBlankRecord(cells) && cells.length >= 2 && cells.length <= width ? [index] : []));

  const textual = candidates.find((index) => readsAsText(records[index]));
  if (textual !== undefined) return textual;
  if (candidates.length > 0) return candidates[0];

  const firstFilled = records.findIndex((cells) => !isBlankRecord(cells));

  return firstFilled === -1 ? 0 : firstFilled;
}

export function readDelimitedTable(rawText: string): DelimitedTable {
  const text = stripByteOrderMark(rawText);
  const delimiter = detectDelimiter(text);
  const records = parseDelimitedText(text, delimiter);
  const headerIndex = detectHeaderIndex(records);

  const rows = records.flatMap((cells, index) =>
    index > headerIndex && !isBlankRecord(cells) ? [{ record: index + 1, cells }] : [],
  );

  return { delimiter, headerRecord: headerIndex + 1, header: records[headerIndex] ?? [], rows };
}
