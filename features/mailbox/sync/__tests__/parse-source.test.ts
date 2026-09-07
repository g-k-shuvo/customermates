import { describe, expect, it } from "vitest";

import { parseSourceMessage, type SourceEnvelope } from "../parse-source";

function envelope(source: string, overrides: Partial<SourceEnvelope> = {}): SourceEnvelope {
  return {
    uid: 12,
    source: Buffer.from(source, "utf8"),
    flags: [],
    internalDate: new Date("2026-03-04T08:00:00Z"),
    folderId: "INBOX",
    ...overrides,
  };
}

const REPLY = [
  "From: Anna Weber <Anna.Weber@Buyer.example>",
  "To: Max Bergmann <max@vendor.example>, Sales <sales@vendor.example>",
  "Cc: Legal <legal@buyer.example>",
  "Subject: Re: Renewal quote",
  "Message-ID: <reply-9@buyer.example>",
  "In-Reply-To: <root-1@vendor.example>",
  "References: <root-1@vendor.example> <mid-4@buyer.example>",
  "Date: Wed, 04 Mar 2026 09:30:00 +0100",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Looks good, please proceed.",
  "",
].join("\r\n");

describe("parseSourceMessage", () => {
  it("reads the threading headers a conversation key depends on", async () => {
    const parsed = await parseSourceMessage(envelope(REPLY));

    expect(parsed.threading.messageId).toBe("<reply-9@buyer.example>");
    expect(parsed.threading.inReplyTo).toBe("<root-1@vendor.example>");
    expect(parsed.threading.references).toEqual(["<root-1@vendor.example>", "<mid-4@buyer.example>"]);
    expect(parsed.threading.subject).toBe("Re: Renewal quote");
  });

  it("collects every address across from, to and cc for the subject fallback", async () => {
    const parsed = await parseSourceMessage(envelope(REPLY));

    expect(parsed.threading.participants).toEqual([
      "Anna.Weber@Buyer.example",
      "max@vendor.example",
      "sales@vendor.example",
      "legal@buyer.example",
    ]);
  });

  it("carries the envelope through to the message record", async () => {
    const parsed = await parseSourceMessage(envelope(REPLY, { uid: 44, folderId: "[Gmail]/All Mail" }));

    expect(parsed.uid).toBe(44);
    expect(parsed.message.providerMessageId).toBe("44");
    expect(parsed.message.folderIds).toEqual(["[Gmail]/All Mail"]);
    expect(parsed.message.receivedAt).toEqual(new Date("2026-03-04T08:00:00Z"));
  });

  it("marks a draft from the imap flag rather than the body", async () => {
    const draft = await parseSourceMessage(envelope(REPLY, { flags: ["\\Draft", "\\Seen"] }));
    const sent = await parseSourceMessage(envelope(REPLY, { flags: ["\\Seen"] }));

    expect(draft.message.isDraft).toBe(true);
    expect(sent.message.isDraft).toBe(false);
  });

  it("reads the text body and leaves html absent when there is none", async () => {
    const parsed = await parseSourceMessage(envelope(REPLY));

    expect(parsed.message.text).toContain("Looks good, please proceed.");
    expect(parsed.message.html).toBeFalsy();
  });

  it("keeps the html part when the message is multipart", async () => {
    const multipart = [
      "From: a@vendor.example",
      "To: b@buyer.example",
      "Subject: Multipart",
      "Message-ID: <mp@vendor.example>",
      'Content-Type: multipart/alternative; boundary="X"',
      "",
      "--X",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "plain body",
      "--X",
      "Content-Type: text/html; charset=utf-8",
      "",
      "<p>html body</p>",
      "--X--",
      "",
    ].join("\r\n");

    const parsed = await parseSourceMessage(envelope(multipart));

    expect(parsed.message.text).toContain("plain body");
    expect(String(parsed.message.html)).toContain("html body");
  });

  it("survives a message with no headers at all", async () => {
    const parsed = await parseSourceMessage(envelope("just a bare body with no headers\r\n"));

    expect(parsed.threading.messageId).toBeNull();
    expect(parsed.message.subject).toBeNull();
    expect(parsed.threading.participants).toEqual([]);
  });

  it("survives an unparseable body without throwing", async () => {
    const parsed = await parseSourceMessage(envelope(""));

    expect(parsed.uid).toBe(12);
    expect(parsed.message.messageId).toBeNull();
  });

  it("decodes a non-ascii subject rather than leaving it encoded", async () => {
    const encoded = [
      "From: a@vendor.example",
      "Subject: =?utf-8?B?QW5nZWJvdCBmw7xyIE3DvGxsZXI=?=",
      "Message-ID: <enc@vendor.example>",
      "",
      "body",
      "",
    ].join("\r\n");

    const parsed = await parseSourceMessage(envelope(encoded));

    expect(parsed.message.subject).toBe("Angebot für Müller");
  });

  it("normalises a single References header into a list", async () => {
    const single = [
      "From: a@vendor.example",
      "Message-ID: <one@vendor.example>",
      "References: <root@vendor.example>",
      "",
      "body",
      "",
    ].join("\r\n");

    const parsed = await parseSourceMessage(envelope(single));

    expect(parsed.threading.references).toEqual(["<root@vendor.example>"]);
  });

  it("truncates an oversized source instead of parsing it whole", async () => {
    const header = ["From: a@vendor.example", "Message-ID: <big@vendor.example>", "Subject: Big", "", ""].join("\r\n");
    const huge = Buffer.alloc(header.length + 26 * 1024 * 1024, 0x61);
    huge.write(header, 0, "utf8");

    const parsed = await parseSourceMessage(envelope("", { source: huge }));

    expect(parsed.message.subject).toBe("Big");
  }, 60_000);
});
