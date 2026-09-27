import { describe, expect, it } from "vitest";

import type { NotesSnapshot } from "../notes-shape";

import { parseMarkdownToJSON } from "@/components/editor/editor.utils";
import { appendMarkdownToNotes, plainTextToNotesDocument } from "@/components/editor/notes-document";
import { MAX_JSON_SIZE, MAX_NOTES_LENGTH } from "@/core/validation/validate-notes";

import { judgeHistory, readStoredColumn, repairValue, shapeOf } from "../notes-shape";

const RICH_DOC = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "underlined", marks: [{ type: "underline" }] },
        { type: "text", text: " and " },
        {
          type: "text",
          text: "a link",
          marks: [{ type: "link", attrs: { href: "https://example.com", target: "_blank" } }],
        },
      ],
    },
  ],
};

const LIST_TEXT = "Follow-ups:\n\n- call Anna\n- send the offer";

const HOSTILE_MESSAGE =
  "Hello from the form\n\n- a\n- b\n\n![x](https://t.example/p.png) [click](https://evil.example)";

function contentOf(markdown: string): unknown[] {
  return (parseMarkdownToJSON(markdown) as { content: unknown[] }).content;
}

function nodeTypes(value: unknown): string[] {
  return [...JSON.stringify(value).matchAll(/"type":"(\w+)"/gu)].map((match) => match[1]);
}

function snapshot(event: NotesSnapshot["event"], value: unknown): NotesSnapshot {
  return { event, value };
}

describe("shapeOf", () => {
  it.each([
    ["JSON null", null, "jsonNull"],
    ["a bare string", "written by an automation", "string"],
    ["a web form message", { message: "hello from the form" }, "message"],
    ["a readable document", RICH_DOC, "doc"],
    ["a document with no content", { type: "doc", content: [] }, "doc"],
    ["a message object with another key", { message: "x", other: 1 }, "other"],
    ["a message that is not text", { message: 1 }, "other"],
    ["an empty object", {}, "other"],
    ["an array", [1, 2], "other"],
    ["a number", 42, "other"],
    ["a document naming an unknown node", { type: "doc", content: [{ type: "banana" }] }, "other"],
    ["a document the schema rejects", { type: "doc", content: [{ type: "text", text: "bare" }] }, "other"],
    ["a node that is not a document", { type: "paragraph" }, "other"],
  ])("classifies %s", (_, value, shape) => {
    expect(shapeOf(value)).toBe(shape);
  });

  it("tells SQL NULL from JSON null", () => {
    expect(readStoredColumn(null)).toEqual({ shape: "sqlNull", value: null });
    expect(readStoredColumn("null")).toEqual({ shape: "jsonNull", value: null });
    expect(readStoredColumn('"text"')).toEqual({ shape: "string", value: "text" });
  });
});

describe("repairValue on a bare string", () => {
  it.each([
    ["one line", "Contact changed by automation"],
    ["paragraphs and a soft line break", "first line\nsecond line\n\n  third para  "],
    ["a markdown list", LIST_TEXT],
    ["inline marks and a link", "**important** and _soft_ and [a link](https://example.com)"],
    ["text that parses as JSON but is no document", '{"a":1}'],
  ])("writes the document the automation note writer parses from %s", (_, text) => {
    expect(repairValue(text)).toEqual({ kind: "convert", notes: parseMarkdownToJSON(text.trim()), oversize: false });
  });

  it("builds lists instead of flattening them into one paragraph", () => {
    expect(nodeTypes(repairValue(LIST_TEXT))).toContain("bulletList");
  });

  it("trims before parsing, so an indented note stays a paragraph as in the appendNote fold", () => {
    const text = "    indented automation note";
    const repair = repairValue(text);
    const folded = appendMarkdownToNotes(text, "appended later");

    expect(repair).toEqual({ kind: "convert", notes: parseMarkdownToJSON(text.trim()), oversize: false });
    expect(nodeTypes(repair)).not.toContain("codeBlock");
    expect(folded).toEqual({
      ok: true,
      document: { type: "doc", content: [...contentOf(text.trim()), ...contentOf("appended later")] },
    });
  });

  it.each(["", "   ", "  \n\t \n"])("clears blank text %j to NULL", (text) => {
    expect(repairValue(text)).toEqual({ kind: "clear" });
  });

  it("unwraps a document that was stored as a string", () => {
    expect(repairValue(JSON.stringify(RICH_DOC))).toEqual({ kind: "convert", notes: RICH_DOC, oversize: false });
  });

  it("clears a string holding an empty document", () => {
    expect(repairValue(JSON.stringify({ type: "doc", content: [] }))).toEqual({ kind: "clear" });
  });

  it.each([
    ["an unknown node", { type: "doc", content: [{ type: "banana" }] }],
    ["content the schema rejects", { type: "doc", content: [{ type: "text", text: "bare" }] }],
  ])("refuses a string holding a document with %s", (_, document) => {
    expect(repairValue(JSON.stringify(document))).toEqual({ kind: "unreadable" });
  });
});

describe("repairValue on a web form message", () => {
  it("keeps the message literal, exactly as the web form writer stores it", () => {
    const repair = repairValue({ message: HOSTILE_MESSAGE });

    expect(repair).toEqual({ kind: "convert", notes: plainTextToNotesDocument(HOSTILE_MESSAGE), oversize: false });
    expect(new Set(nodeTypes(repair))).toEqual(new Set(["doc", "paragraph", "text", "hardBreak"]));
  });

  it("clears a blank web form message", () => {
    expect(repairValue({ message: " \n\t " })).toEqual({ kind: "clear" });
  });

  it("never rewrites a value the app cannot read", () => {
    expect(repairValue({})).toEqual({ kind: "unreadable" });
    expect(repairValue({ message: "x", other: 1 })).toEqual({ kind: "unreadable" });
  });
});

describe("repairValue size flag", () => {
  it("flags text longer than the app accepts, and still converts it", () => {
    const repair = repairValue("x".repeat(MAX_NOTES_LENGTH + 1));

    expect(repair.kind).toBe("convert");
    expect(repair.kind === "convert" && repair.oversize).toBe(true);
  });

  it("flags a document bigger than the app accepts although its text is short enough", () => {
    const text = "- a\n".repeat(16_000);
    const repair = repairValue(text);

    expect(text.length).toBeLessThanOrEqual(MAX_NOTES_LENGTH);
    expect(repair.kind === "convert" && JSON.stringify(repair.notes).length > MAX_JSON_SIZE).toBe(true);
    expect(repair.kind === "convert" && repair.oversize).toBe(true);
  });

  it("does not flag an ordinary note", () => {
    expect(repairValue("short")).toMatchObject({ kind: "convert", oversize: false });
  });
});

describe("judgeHistory", () => {
  const current = "Contact changed by automation";

  it("knows nothing without a snapshot", () => {
    expect(judgeHistory(current, [])).toEqual({ kind: "noHistory" });
  });

  it("knows nothing when every snapshot already holds a string and none records the creation", () => {
    expect(judgeHistory(current, [snapshot("updated", current)])).toEqual({ kind: "noHistory" });
  });

  it("finds nothing lost when the record was created with the same text", () => {
    expect(judgeHistory(current, [snapshot("created", current), snapshot("updated", current)])).toEqual({
      kind: "nothingLost",
    });
  });

  it.each([
    ["JSON null", null],
    ["an empty document", { type: "doc", content: [{ type: "paragraph" }] }],
    ["a blank web form message", { message: "  " }],
  ])("finds nothing lost when the notes were %s before the text", (_, before) => {
    expect(judgeHistory(current, [snapshot("created", before)])).toEqual({ kind: "nothingLost" });
  });

  it("restores the overwritten document in front of the text, keeping marks a markdown round trip drops", () => {
    const verdict = judgeHistory(current, [snapshot("created", RICH_DOC)]);

    expect(verdict).toEqual({
      kind: "recoverable",
      notes: { type: "doc", content: [...RICH_DOC.content, ...contentOf(current)] },
      oversize: false,
    });
    expect(JSON.stringify(verdict)).toContain('"underline"');
    expect(JSON.stringify(verdict)).toContain('"_blank"');
  });

  it("restores from the latest readable snapshot and keeps every text the automation overwrote since", () => {
    const older = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "older" }] }] };
    const snapshots = [
      snapshot("created", older),
      snapshot("updated", RICH_DOC),
      snapshot("updated", "first automation note"),
      snapshot("updated", "first automation note"),
      snapshot("updated", "second automation note"),
    ];

    expect(judgeHistory(current, snapshots)).toEqual({
      kind: "recoverable",
      notes: {
        type: "doc",
        content: [
          ...RICH_DOC.content,
          ...contentOf("first automation note"),
          ...contentOf("second automation note"),
          ...contentOf(current),
        ],
      },
      oversize: false,
    });
  });

  it("restores a web form message the automation overwrote as the literal text the form sent", () => {
    const message = "from the form\n- not a list";
    const verdict = judgeHistory(LIST_TEXT, [snapshot("created", { message })]);
    const messageBlocks = (plainTextToNotesDocument(message) as { content: unknown[] }).content;

    expect(verdict).toEqual({
      kind: "recoverable",
      notes: { type: "doc", content: [...messageBlocks, ...contentOf(LIST_TEXT)] },
      oversize: false,
    });
  });

  it.each([
    ["an object the editor cannot read", {}],
    ["a document the schema rejects", { type: "doc", content: [{ type: "text", text: "bare" }] }],
  ])("recovers nothing from %s", (_, before) => {
    expect(judgeHistory(current, [snapshot("created", before)])).toEqual({ kind: "unreadableHistory" });
  });
});
