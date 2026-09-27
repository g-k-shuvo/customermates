import type { StoredNotes } from "@/components/editor/notes-document";

import { Node } from "@tiptap/pm/model";

import { editorSchema } from "@/components/editor/editor-extensions";
import { readStoredNotes } from "@/components/editor/notes-document";
import { MAX_JSON_SIZE, MAX_NOTES_LENGTH } from "@/core/validation/validate-notes";

export type NotesDocument = { type: "doc"; content: unknown[] };

export const NOTES_SHAPES = ["string", "message", "doc", "other", "jsonNull", "sqlNull"] as const;

export type NotesShape = (typeof NOTES_SHAPES)[number];

export type StoredColumn = { shape: NotesShape; value: unknown };

export type NotesRepair =
  | { kind: "convert"; notes: NotesDocument; oversize: boolean }
  | { kind: "clear" }
  | { kind: "unreadable" };

export type NotesSnapshot = { event: "created" | "updated"; value: unknown };

export type HistoryVerdict =
  | { kind: "noHistory" }
  | { kind: "nothingLost" }
  | { kind: "recoverable"; notes: NotesDocument; oversize: boolean }
  | { kind: "unreadableHistory" };

export type HistoryKind = HistoryVerdict["kind"];

export const HISTORY_KINDS = ["noHistory", "nothingLost", "recoverable", "unreadableHistory"] as const;

function isDocumentObject(value: unknown): boolean {
  return typeof value === "object" && value !== null && (value as { type?: unknown }).type === "doc";
}

function isValidDocument(notes: NotesDocument): boolean {
  try {
    Node.fromJSON(editorSchema, notes).check();
    return true;
  } catch {
    return false;
  }
}

function sourceLength(value: unknown): number {
  if (typeof value === "string") return value.length;
  if (typeof value === "object" && value !== null && "message" in value) return String(value.message).length;

  return 0;
}

export function shapeOf(value: unknown): Exclude<NotesShape, "sqlNull"> {
  if (value === null) return "jsonNull";
  if (typeof value === "string") return "string";
  if (!readStoredNotes(value).readable) return "other";

  return isDocumentObject(value) ? "doc" : "message";
}

export function readStoredColumn(raw: string | null): StoredColumn {
  if (raw === null) return { shape: "sqlNull", value: null };

  const value: unknown = JSON.parse(raw);

  return { shape: shapeOf(value), value };
}

function documentOf(blocks: readonly unknown[], textLength: number): NotesRepair {
  const notes: NotesDocument = { type: "doc", content: [...blocks] };
  if (!isValidDocument(notes)) return { kind: "unreadable" };

  const oversize = textLength > MAX_NOTES_LENGTH || JSON.stringify(notes).length > MAX_JSON_SIZE;

  return { kind: "convert", notes, oversize };
}

export function repairValue(value: unknown): NotesRepair {
  const stored = readStoredNotes(value);
  if (!stored.readable) return { kind: "unreadable" };
  if (stored.blocks.length === 0) return { kind: "clear" };

  return documentOf(stored.blocks, sourceLength(value));
}

function withoutRepeats(texts: readonly string[]): string[] {
  return texts.filter((text, index) => index === 0 || text !== texts[index - 1]);
}

export function judgeHistory(currentText: string, snapshots: readonly NotesSnapshot[]): HistoryVerdict {
  const current = readStoredNotes(currentText);
  if (!current.readable) return { kind: "unreadableHistory" };

  const baseIndex = snapshots.findLastIndex((snapshot) => typeof snapshot.value !== "string");
  if (baseIndex < 0 && snapshots[0]?.event !== "created") return { kind: "noHistory" };

  const base: StoredNotes =
    baseIndex < 0 ? { readable: true, blocks: [] } : readStoredNotes(snapshots[baseIndex].value);
  if (!base.readable) return { kind: "unreadableHistory" };

  const overwritten = snapshots
    .slice(baseIndex + 1)
    .flatMap((snapshot) => (typeof snapshot.value === "string" ? [snapshot.value] : []));
  const pieces = withoutRepeats([...overwritten, currentText]).map((text) => readStoredNotes(text));

  const content: unknown[] = [...base.blocks];
  for (const piece of pieces) {
    if (!piece.readable) return { kind: "unreadableHistory" };
    content.push(...piece.blocks);
  }
  if (JSON.stringify(content) === JSON.stringify(current.blocks)) return { kind: "nothingLost" };

  const restored = documentOf(content, 0);

  return restored.kind === "convert"
    ? { kind: "recoverable", notes: restored.notes, oversize: restored.oversize }
    : { kind: "unreadableHistory" };
}
