import { simpleParser } from "mailparser";

import type { ParsedMailboxMessage } from "./normalize-message";
import type { ThreadingHeaders } from "./thread-key";

export type ParsedAttachment = {
  fileName: string;
  contentType: string;
  byteSize: number;
  contentId: string | null;
  inline: boolean;
  content: Buffer;
};

export type ParsedSourceMessage = {
  uid: number;
  message: ParsedMailboxMessage;
  threading: ThreadingHeaders;
  attachments: ParsedAttachment[];
};

export type SourceEnvelope = {
  uid: number;
  source: Buffer;
  flags: readonly string[];
  internalDate: Date | null;
  folderId: string;
};

const DRAFT_FLAG = "\\draft";
const MAX_PARSED_BYTES = 25 * 1024 * 1024;
const MAX_ATTACHMENTS = 50;
const UNNAMED_ATTACHMENT = "attachment";

function addressField(value: unknown) {
  return (value ?? null) as ParsedMailboxMessage["from"];
}

function referencesOf(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string");

  return [];
}

function isDraft(flags: readonly string[]): boolean {
  return flags.some((flag) => flag.toLowerCase() === DRAFT_FLAG);
}

export async function parseSourceMessage(envelope: SourceEnvelope): Promise<ParsedSourceMessage> {
  const truncated = envelope.source.byteLength > MAX_PARSED_BYTES;
  const source = truncated ? envelope.source.subarray(0, MAX_PARSED_BYTES) : envelope.source;
  const parsed = await simpleParser(source, { skipImageLinks: true, skipTextToHtml: true });

  const message: ParsedMailboxMessage = {
    messageId: parsed.messageId ?? null,
    from: addressField(parsed.from),
    to: addressField(parsed.to),
    cc: addressField(parsed.cc),
    bcc: addressField(parsed.bcc),
    subject: parsed.subject ?? null,
    date: parsed.date ?? null,
    text: parsed.text ?? null,
    html: parsed.html ?? null,
    receivedAt: envelope.internalDate,
    folderIds: [envelope.folderId],
    providerMessageId: String(envelope.uid),
    isDraft: isDraft(envelope.flags),
  };

  const threading: ThreadingHeaders = {
    messageId: parsed.messageId ?? null,
    inReplyTo: parsed.inReplyTo ?? null,
    references: referencesOf(parsed.references),
    subject: parsed.subject ?? null,
    participants: participantsOf(parsed),
  };

  return { uid: envelope.uid, message, threading, attachments: truncated ? [] : attachmentsOf(parsed.attachments) };
}

type MailparserAttachment = {
  filename?: string;
  contentType?: string;
  size?: number;
  content?: unknown;
  cid?: string;
  contentDisposition?: string;
  related?: boolean;
};

function attachmentsOf(list: readonly MailparserAttachment[] | undefined): ParsedAttachment[] {
  return (list ?? [])
    .filter((attachment) => Buffer.isBuffer(attachment.content) && attachment.content.byteLength > 0)
    .slice(0, MAX_ATTACHMENTS)
    .map((attachment) => {
      const content = attachment.content as Buffer;
      const contentId = attachment.cid?.trim() || null;

      return {
        fileName: attachment.filename?.trim() || UNNAMED_ATTACHMENT,
        contentType: attachment.contentType?.trim() || "application/octet-stream",
        byteSize: content.byteLength,
        contentId,
        inline: contentId !== null && (attachment.related === true || attachment.contentDisposition === "inline"),
        content,
      };
    });
}

function participantsOf(parsed: { from?: unknown; to?: unknown; cc?: unknown }): string[] {
  const found: string[] = [];

  for (const field of [parsed.from, parsed.to, parsed.cc]) collectAddresses(field, found, 0);

  return found;
}

function collectAddresses(field: unknown, found: string[], depth: number): void {
  if (!field || depth > 4 || found.length > 1000) return;

  if (Array.isArray(field)) {
    for (const entry of field) collectAddresses(entry, found, depth + 1);
    return;
  }

  const list = (field as { value?: unknown }).value;
  if (!Array.isArray(list)) return;

  for (const entry of list) {
    const address = (entry as { address?: unknown }).address;
    if (typeof address === "string" && address.length > 0) found.push(address);

    const group = (entry as { group?: unknown }).group;
    if (Array.isArray(group)) collectAddresses({ value: group }, found, depth + 1);
  }
}
