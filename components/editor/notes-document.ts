import { Node } from "@tiptap/pm/model";

import { editorSchema } from "@/components/editor/editor-extensions";
import { parseMarkdownToJSON, serializeJSONToMarkdown } from "@/components/editor/editor.utils";
import { MAX_JSON_SIZE, MAX_NOTES_LENGTH } from "@/core/validation/validate-notes";

type JsonObject = Record<string, unknown>;

export type StoredNotes = { readable: true; blocks: JsonObject[] } | { readable: false };

export type NotesAppendResult = { ok: true; document: JsonObject } | { ok: false; reason: "unreadable" | "tooLong" };

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidDocument(document: JsonObject): boolean {
  try {
    Node.fromJSON(editorSchema, document).check();

    return true;
  } catch {
    return false;
  }
}

function isBlankParagraph(block: unknown): boolean {
  if (!isJsonObject(block) || block.type !== "paragraph") return false;

  return !Array.isArray(block.content) || block.content.length === 0;
}

function withoutBlankDocument(blocks: JsonObject[]): JsonObject[] {
  return blocks.every(isBlankParagraph) ? [] : blocks;
}

function markdownBlocks(markdown: string): JsonObject[] {
  const { content } = parseMarkdownToJSON(markdown) as { content?: JsonObject[] };

  return withoutBlankDocument(content ?? []);
}

function lineNodes(paragraph: string): JsonObject[] {
  return paragraph.split("\n").flatMap((line, index) => {
    const text = line.trimEnd();
    const lineBreak = index > 0 ? [{ type: "hardBreak" }] : [];

    return text ? [...lineBreak, { type: "text", text }] : lineBreak;
  });
}

function plainTextBlocks(text: string): JsonObject[] {
  return text
    .replaceAll("\u0000", "�")
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => ({ type: "paragraph", content: lineNodes(chunk) }));
}

function storedDocument(document: JsonObject): StoredNotes {
  const { content } = document;
  const holdsNothing = content === undefined || content === null || (Array.isArray(content) && content.length === 0);

  if (holdsNothing) return { readable: true, blocks: [] };
  if (!isValidDocument(document)) return { readable: false };

  return { readable: true, blocks: withoutBlankDocument(content as JsonObject[]) };
}

function documentInText(text: string): JsonObject | null {
  if (!text.startsWith("{")) return null;

  try {
    const parsed: unknown = JSON.parse(text);

    return isJsonObject(parsed) && parsed.type === "doc" ? parsed : null;
  } catch {
    return null;
  }
}

function isMessageOnly(notes: JsonObject): notes is { message: string } {
  return Object.keys(notes).length === 1 && typeof notes.message === "string";
}

export function plainTextToNotesDocument(text: string): JsonObject | null {
  const blocks = plainTextBlocks(text);

  return blocks.length > 0 ? { type: "doc", content: blocks } : null;
}

export function readStoredNotes(notes: unknown): StoredNotes {
  if (notes === null || notes === undefined) return { readable: true, blocks: [] };

  if (typeof notes === "string") {
    const text = notes.trim();
    if (!text) return { readable: true, blocks: [] };

    const embedded = documentInText(text);

    return embedded ? storedDocument(embedded) : { readable: true, blocks: markdownBlocks(text) };
  }

  if (!isJsonObject(notes)) return { readable: false };
  if (notes.type === "doc") return storedDocument(notes);
  if (isMessageOnly(notes)) return { readable: true, blocks: plainTextBlocks(notes.message) };

  return { readable: false };
}

export function appendMarkdownToNotes(notes: unknown, markdown: string): NotesAppendResult {
  if (markdown.length > MAX_NOTES_LENGTH) return { ok: false, reason: "tooLong" };

  const stored = readStoredNotes(notes);
  if (!stored.readable) return { ok: false, reason: "unreadable" };

  const base = isJsonObject(notes) && notes.type === "doc" ? notes : { type: "doc" };
  const document = { ...base, content: [...stored.blocks, ...markdownBlocks(markdown)] };

  if (!isValidDocument(document)) return { ok: false, reason: "unreadable" };
  if (JSON.stringify(document).length > MAX_JSON_SIZE) return { ok: false, reason: "tooLong" };

  return { ok: true, document };
}

export function storedNotesAsMarkdown(notes: unknown): string | null {
  const stored = readStoredNotes(notes);
  if (!stored.readable || stored.blocks.length === 0) return null;

  try {
    return serializeJSONToMarkdown({ type: "doc", content: stored.blocks }).trim() || null;
  } catch {
    return null;
  }
}
