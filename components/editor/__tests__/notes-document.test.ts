import { Node } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";

import { editorSchema } from "../editor-extensions";
import { parseMarkdownToJSON } from "../editor.utils";
import {
  appendMarkdownToNotes,
  plainTextToNotesDocument,
  readStoredNotes,
  storedNotesAsMarkdown,
} from "../notes-document";
import { MAX_JSON_SIZE, MAX_NOTES_LENGTH } from "@/core/validation/validate-notes";

const RICH_PARAGRAPH = {
  type: "paragraph",
  content: [
    { type: "text", text: "underlined", marks: [{ type: "underline" }] },
    { type: "text", text: " and " },
    {
      type: "text",
      text: "a link",
      marks: [{ type: "link", attrs: { href: "https://example.test/deal", target: "_self", rel: null, class: null } }],
    },
  ],
};

const RICH_DOCUMENT = { type: "doc", content: [RICH_PARAGRAPH] };

function isValidDocument(document: unknown) {
  Node.fromJSON(editorSchema, document).check();

  return true;
}

describe("plainTextToNotesDocument", () => {
  it("keeps untrusted text literal, so markdown syntax never becomes a link or a heading", () => {
    const document = plainTextToNotesDocument("# Urgent\n[claim your prize](https://evil.test)\n**now**");

    expect(document).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "# Urgent" },
            { type: "hardBreak" },
            { type: "text", text: "[claim your prize](https://evil.test)" },
            { type: "hardBreak" },
            { type: "text", text: "**now**" },
          ],
        },
      ],
    });
    expect(isValidDocument(document)).toBe(true);
  });

  it("splits blank lines into paragraphs and normalises Windows line endings", () => {
    const document = plainTextToNotesDocument("  Hello,\r\n\r\n \t\r\nplease call me back.  \r\n");

    expect(document).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Hello," }] },
        { type: "paragraph", content: [{ type: "text", text: "please call me back." }] },
      ],
    });
  });

  it("stores nothing for a blank message", () => {
    expect(plainTextToNotesDocument(" \n\t\n ")).toBeNull();
  });

  it("replaces a NUL character, which a JSON column cannot hold", () => {
    expect(plainTextToNotesDocument("a\u0000b")).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "a�b" }] }],
    });
  });
});

describe("readStoredNotes", () => {
  it("reads nothing from empty notes", () => {
    expect(readStoredNotes(null)).toEqual({ readable: true, blocks: [] });
    expect(readStoredNotes(undefined)).toEqual({ readable: true, blocks: [] });
    expect(readStoredNotes("   ")).toEqual({ readable: true, blocks: [] });
    expect(readStoredNotes({ type: "doc", content: [{ type: "paragraph" }] })).toEqual({ readable: true, blocks: [] });
  });

  it("folds a bare string left by the old writer as markdown", () => {
    expect(readStoredNotes("written by **an automation**")).toEqual({
      readable: true,
      blocks: (parseMarkdownToJSON("written by **an automation**") as { content: unknown[] }).content,
    });
  });

  it("reads a document that was stored as a JSON string", () => {
    expect(readStoredNotes(JSON.stringify(RICH_DOCUMENT))).toEqual({ readable: true, blocks: [RICH_PARAGRAPH] });
  });

  it("folds a web form message object as literal text", () => {
    expect(readStoredNotes({ message: "Call me\n[now](https://evil.test)" })).toEqual({
      readable: true,
      blocks: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Call me" },
            { type: "hardBreak" },
            { type: "text", text: "[now](https://evil.test)" },
          ],
        },
      ],
    });
  });

  it("refuses every other shape rather than guessing", () => {
    expect(readStoredNotes({})).toEqual({ readable: false });
    expect(readStoredNotes({ message: "hi", from: "someone" })).toEqual({ readable: false });
    expect(readStoredNotes({ message: 42 })).toEqual({ readable: false });
    expect(readStoredNotes(42)).toEqual({ readable: false });
    expect(readStoredNotes(["note"])).toEqual({ readable: false });
    expect(readStoredNotes({ type: "doc", content: [{ type: "unknownBlock" }] })).toEqual({ readable: false });
    expect(readStoredNotes({ type: "doc", content: [{ type: "text", text: "not in a block" }] })).toEqual({
      readable: false,
    });
  });
});

describe("appendMarkdownToNotes", () => {
  it("appends at the document level, keeping underline and the link target exactly as stored", () => {
    const result = appendMarkdownToNotes(RICH_DOCUMENT, "written by an automation");

    expect(result).toEqual({
      ok: true,
      document: {
        type: "doc",
        content: [RICH_PARAGRAPH, { type: "paragraph", content: [{ type: "text", text: "written by an automation" }] }],
      },
    });
    expect(isValidDocument(result.ok ? result.document : null)).toBe(true);
  });

  it("starts a document when the record has no notes yet", () => {
    expect(appendMarkdownToNotes(null, "first")).toEqual({
      ok: true,
      document: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "first" }] }] },
    });
  });

  it("refuses notes it cannot read instead of replacing them", () => {
    expect(appendMarkdownToNotes({ unexpected: true }, "body")).toEqual({ ok: false, reason: "unreadable" });
  });

  it("refuses to grow the notes past the size the editor accepts", () => {
    const filler = { type: "paragraph", content: [{ type: "text", text: "x".repeat(1000) }] };
    const large = { type: "doc", content: Array.from({ length: Math.ceil(MAX_JSON_SIZE / 1000) }, () => filler) };

    expect(appendMarkdownToNotes(large, "one more line")).toEqual({ ok: false, reason: "tooLong" });
    expect(appendMarkdownToNotes(null, "y".repeat(MAX_NOTES_LENGTH + 1))).toEqual({ ok: false, reason: "tooLong" });
  });
});

describe("storedNotesAsMarkdown", () => {
  it("reads every foldable shape and never throws on the rest", () => {
    expect(storedNotesAsMarkdown(null)).toBeNull();
    expect(storedNotesAsMarkdown("plain words")).toBe("plain words");
    expect(storedNotesAsMarkdown({ message: "from the website" })).toBe("from the website");
    expect(storedNotesAsMarkdown(parseMarkdownToJSON("**bold**"))).toBe("**bold**");
    expect(storedNotesAsMarkdown({ unexpected: true })).toBeNull();
  });
});
