import { createHash } from "node:crypto";

import type { MessagingMessageDirection, MessagingMessageOrigin, MessagingProvider } from "@/generated/prisma";

export type ParsedMailAddress = {
  address?: string | null;
  name?: string | null;
  group?: ParsedMailAddress[] | null;
};

export type ParsedMailAddressList = {
  value?: ParsedMailAddress[] | null;
};

export type ParsedMailAddressField = ParsedMailAddressList | ParsedMailAddressList[] | null;

export type ParsedMailboxMessage = {
  messageId?: string | null;
  from?: ParsedMailAddressField;
  to?: ParsedMailAddressField;
  cc?: ParsedMailAddressField;
  bcc?: ParsedMailAddressField;
  subject?: string | null;
  date?: Date | string | number | null;
  text?: string | null;
  html?: string | false | null;
  receivedAt?: Date | string | number | null;
  folderIds?: string[] | null;
  providerMessageId?: string | null;
  isDraft?: boolean | null;
};

export type MailboxSyncContext = {
  companyId: string;
  connectedAccountId: string;
  messagingThreadId: string;
  mailboxAddress: string;
  mailboxDisplayName?: string | null;
  mailboxAliases?: string[] | null;
  sentFolderIds?: string[] | null;
};

export type MessageAttendee = {
  attendeeId: string;
  identifier: string;
  displayName: string | null;
};

export type MessageSender = {
  attendeeId: string;
  identifier: string;
  displayName: string | null;
  isSelf: boolean;
};

export type MessageRecipients = {
  to: MessageAttendee[];
  cc: MessageAttendee[];
  bcc: MessageAttendee[];
};

export type SentAtSource = "header" | "received" | "epochFallback";

export type NormalizedMessageRecord = {
  companyId: string;
  messagingThreadId: string;
  connectedAccountId: string;
  unipileMessageId: string;
  providerMessageId: string | null;
  provider: MessagingProvider;
  direction: MessagingMessageDirection;
  origin: MessagingMessageOrigin;
  sender: MessageSender;
  senderIdentifier: string | null;
  recipients: MessageRecipients;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  folderIds: string[];
  isDraft: boolean;
  sentAt: Date;
};

export type NormalizedMessageParticipant = {
  companyId: string;
  messagingThreadId: string;
  provider: MessagingProvider;
  providerUserId: string;
  identifier: string;
  displayName: string | null;
  isSelf: boolean;
};

export type NormalizedMessage = {
  message: NormalizedMessageRecord;
  participants: NormalizedMessageParticipant[];
  sentAtSource: SentAtSource;
};

const MAIL_PROVIDER: MessagingProvider = "mail";
const EXTERNAL_ORIGIN: MessagingMessageOrigin = "external";
const INBOUND: MessagingMessageDirection = "inbound";
const OUTBOUND: MessagingMessageDirection = "outbound";

const MESSAGE_ID_PREFIX = "imap:msg:id:";
const HASHED_MESSAGE_ID_PREFIX = "imap:msg:id-sha256:";
const FINGERPRINT_PREFIX = "imap:msg:sha256:";
const MAX_MESSAGE_ID_LENGTH = 512;

const ADDRESS_PATTERN = /^[^\s@<>,;:"]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/;
const ANGLE_ADDRESS_PATTERN = /<([^<>]*)>/;
const MAX_ADDRESS_DEPTH = 4;
const MAX_ADDRESS_LENGTH = 320;
const MAX_ADDRESSES_PER_FIELD = 1000;

const HIDDEN_BLOCK_TAGS = "script|style|head";

const EARLIEST_PLAUSIBLE_SENT_AT = Date.UTC(1990, 0, 1);
const MAX_SENT_AT_SKEW_MS = 48 * 60 * 60 * 1000;
const EPOCH_SENT_AT_MS = 0;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

export function normalizeAddress(raw: unknown): string | null {
  if (typeof raw !== "string") return null;

  const trimmed = raw.trim();
  const angled = trimmed.match(ANGLE_ADDRESS_PATTERN);
  const candidate = (angled ? angled[1] : trimmed).trim().toLowerCase();
  if (candidate.length > MAX_ADDRESS_LENGTH) return null;

  return ADDRESS_PATTERN.test(candidate) ? candidate : null;
}

function readDisplayName(entry: ParsedMailAddress): string | null {
  if (typeof entry.name !== "string") return null;

  const trimmed = entry.name.trim();
  if (!trimmed) return null;

  const nameAsAddress = normalizeAddress(trimmed);

  return nameAsAddress && nameAsAddress === normalizeAddress(entry.address) ? null : trimmed;
}

function flattenAddresses(entries: unknown, depth: number): ParsedMailAddress[] {
  if (!Array.isArray(entries) || depth > MAX_ADDRESS_DEPTH) return [];

  const flattened: ParsedMailAddress[] = [];
  for (const entry of entries as ParsedMailAddress[]) {
    if (flattened.length >= MAX_ADDRESSES_PER_FIELD) break;
    if (!entry || typeof entry !== "object") continue;
    const group = Array.isArray(entry.group) ? flattenAddresses(entry.group, depth + 1) : [];
    for (const nested of group) flattened.push(nested);
    if (typeof entry.address === "string") flattened.push(entry);
  }

  return flattened.slice(0, MAX_ADDRESSES_PER_FIELD);
}

function readAddressField(field: unknown, depth = 0): ParsedMailAddress[] {
  if (!field || typeof field !== "object" || depth > MAX_ADDRESS_DEPTH) return [];
  if (!Array.isArray(field)) return flattenAddresses((field as ParsedMailAddressList).value, depth);

  const collected: ParsedMailAddress[] = [];
  for (const entry of field) {
    if (collected.length >= MAX_ADDRESSES_PER_FIELD) break;
    for (const address of readAddressField(entry, depth + 1)) collected.push(address);
  }

  return collected.slice(0, MAX_ADDRESSES_PER_FIELD);
}

function takeAttendees(entries: ParsedMailAddress[], claimed: Set<string>): MessageAttendee[] {
  const attendees: MessageAttendee[] = [];

  for (const entry of entries) {
    const identifier = normalizeAddress(entry.address);
    if (!identifier || claimed.has(identifier)) continue;

    claimed.add(identifier);
    attendees.push({ attendeeId: identifier, identifier, displayName: readDisplayName(entry) });
  }

  return attendees;
}

function readOwnIdentities(context: MailboxSyncContext): Set<string> {
  const identities = new Set<string>();
  const primary = normalizeAddress(context.mailboxAddress);
  if (primary) identities.add(primary);

  const aliases = Array.isArray(context.mailboxAliases) ? context.mailboxAliases : [];
  for (const alias of aliases) {
    const identity = normalizeAddress(alias);
    if (identity) identities.add(identity);
  }

  return identities;
}

function readFolderIds(message: ParsedMailboxMessage): string[] {
  if (!Array.isArray(message.folderIds)) return [];

  return message.folderIds.filter((folder): folder is string => typeof folder === "string" && folder.trim().length > 0);
}

function resolveDirection(
  senderIdentifier: string | null,
  folderIds: string[],
  ownIdentities: Set<string>,
  context: MailboxSyncContext,
): MessagingMessageDirection {
  if (senderIdentifier) return ownIdentities.has(senderIdentifier) ? OUTBOUND : INBOUND;

  const sentFolderIds = Array.isArray(context.sentFolderIds) ? context.sentFolderIds : [];
  const sentFolders = new Set(sentFolderIds);

  return folderIds.some((folder) => sentFolders.has(folder)) ? OUTBOUND : INBOUND;
}

function representableDate(time: number): Date | null {
  const date = new Date(time);

  return Number.isFinite(date.getTime()) ? date : null;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return representableDate(value.getTime());
  if (typeof value === "number") return representableDate(value);
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  return representableDate(new Date(trimmed).getTime());
}

function isPlausibleSentAt(candidate: Date, reference: Date | null): boolean {
  const time = candidate.getTime();
  if (!Number.isFinite(time) || time < EARLIEST_PLAUSIBLE_SENT_AT) return false;
  if (!reference) return true;

  const referenceTime = reference.getTime();
  if (!Number.isFinite(referenceTime)) return true;

  return time <= referenceTime + MAX_SENT_AT_SKEW_MS;
}

function resolveSentAt(message: ParsedMailboxMessage): { sentAt: Date; sentAtSource: SentAtSource } {
  const receivedAt = toDate(message.receivedAt);
  const headerDate = toDate(message.date);

  if (headerDate && isPlausibleSentAt(headerDate, receivedAt)) return { sentAt: headerDate, sentAtSource: "header" };
  if (receivedAt && isPlausibleSentAt(receivedAt, null)) return { sentAt: receivedAt, sentAtSource: "received" };

  return { sentAt: new Date(EPOCH_SENT_AT_MS), sentAtSource: "epochFallback" };
}

function readTrimmedText(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}

function codePointText(codePoint: number, fallback: string): string {
  if (!Number.isInteger(codePoint) || codePoint < 1 || codePoint > 0x10ffff) return fallback;

  return String.fromCodePoint(codePoint);
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, entity: string) => {
    const key = entity.toLowerCase();
    if (key.startsWith("#x")) return codePointText(Number.parseInt(key.slice(2), 16), match);
    if (key.startsWith("#")) return codePointText(Number.parseInt(key.slice(1), 10), match);

    return NAMED_ENTITIES[key] ?? match;
  });
}

function collapseWhitespace(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripHiddenBlocks(html: string): string {
  const opening = new RegExp(`<(${HIDDEN_BLOCK_TAGS})\\b`, "gi");
  let stripped = "";
  let cursor = 0;

  for (let opened = opening.exec(html); opened; opened = opening.exec(html)) {
    stripped += `${html.slice(cursor, opened.index)} `;
    const closing = new RegExp(`</${opened[1]}\\s*>`, "gi");
    closing.lastIndex = opening.lastIndex;
    if (!closing.exec(html)) return stripped;
    cursor = closing.lastIndex;
    opening.lastIndex = cursor;
  }

  return stripped + html.slice(cursor);
}

function htmlToPlainText(html: string): string | null {
  const withLineBreaks = stripHiddenBlocks(html)
    .replace(/<br\b[^<>]*>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)\s*>/gi, "\n");

  return readTrimmedText(collapseWhitespace(decodeEntities(withLineBreaks.replace(/<[^<>]*>/g, " "))));
}

function readMessageId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;

  const trimmed = raw.trim();
  const angled = trimmed.match(ANGLE_ADDRESS_PATTERN);

  return readTrimmedText(angled ? angled[1] : trimmed);
}

function identifiersOf(attendees: MessageAttendee[]): string {
  return attendees.map((attendee) => attendee.identifier).join(",");
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function messageIdentity(headerMessageId: string | null, fingerprint: string): string {
  if (!headerMessageId) return `${FINGERPRINT_PREFIX}${sha256Hex(fingerprint)}`;
  if (headerMessageId.length > MAX_MESSAGE_ID_LENGTH) return `${HASHED_MESSAGE_ID_PREFIX}${sha256Hex(headerMessageId)}`;

  return `${MESSAGE_ID_PREFIX}${headerMessageId}`;
}

function addParticipant(
  participants: Map<string, NormalizedMessageParticipant>,
  identifier: string,
  displayName: string | null,
  ownIdentities: Set<string>,
  context: MailboxSyncContext,
): void {
  const existing = participants.get(identifier);
  if (existing) {
    if (!existing.displayName && displayName) existing.displayName = displayName;

    return;
  }

  participants.set(identifier, {
    companyId: context.companyId,
    messagingThreadId: context.messagingThreadId,
    provider: MAIL_PROVIDER,
    providerUserId: identifier,
    identifier,
    displayName,
    isSelf: ownIdentities.has(identifier),
  });
}

export function normalizeMessage(message: ParsedMailboxMessage, context: MailboxSyncContext): NormalizedMessage {
  const ownIdentities = readOwnIdentities(context);
  const mailboxIdentity = normalizeAddress(context.mailboxAddress);
  const fromEntry = readAddressField(message.from).at(0);
  const senderIdentifier = normalizeAddress(fromEntry?.address);
  const senderDisplayName = fromEntry ? readDisplayName(fromEntry) : null;

  const folderIds = readFolderIds(message);
  const direction = resolveDirection(senderIdentifier, folderIds, ownIdentities, context);

  const claimed = new Set<string>();
  const to = takeAttendees(readAddressField(message.to), claimed);
  const cc = takeAttendees(readAddressField(message.cc), claimed);
  const bcc = direction === OUTBOUND ? takeAttendees(readAddressField(message.bcc), claimed) : [];
  const recipients: MessageRecipients = { to, cc, bcc };

  const subject = readTrimmedText(message.subject);
  const bodyHtml = readTrimmedText(message.html);
  const bodyText = readTrimmedText(message.text) ?? (bodyHtml ? htmlToPlainText(bodyHtml) : null);

  const { sentAt, sentAtSource } = resolveSentAt(message);
  const headerMessageId = readMessageId(message.messageId);
  const fingerprint = JSON.stringify([
    toDate(message.date)?.getTime() ?? null,
    senderIdentifier ?? "",
    identifiersOf(to),
    identifiersOf(cc),
    subject ?? "",
    bodyText ?? "",
    bodyHtml ?? "",
  ]);

  const participants = new Map<string, NormalizedMessageParticipant>();
  if (senderIdentifier) addParticipant(participants, senderIdentifier, senderDisplayName, ownIdentities, context);
  for (const attendee of [...to, ...cc, ...bcc])
    addParticipant(participants, attendee.identifier, attendee.displayName, ownIdentities, context);

  if (mailboxIdentity) {
    const mailboxDisplayName = readTrimmedText(context.mailboxDisplayName);
    addParticipant(participants, mailboxIdentity, mailboxDisplayName, ownIdentities, context);
  }

  return {
    message: {
      companyId: context.companyId,
      messagingThreadId: context.messagingThreadId,
      connectedAccountId: context.connectedAccountId,
      unipileMessageId: messageIdentity(headerMessageId, fingerprint),
      providerMessageId: readTrimmedText(message.providerMessageId),
      provider: MAIL_PROVIDER,
      direction,
      origin: EXTERNAL_ORIGIN,
      sender: {
        attendeeId: senderIdentifier ?? "",
        identifier: senderIdentifier ?? "",
        displayName: senderDisplayName,
        isSelf: direction === OUTBOUND,
      },
      senderIdentifier,
      recipients,
      subject,
      bodyText,
      bodyHtml,
      folderIds,
      isDraft: message.isDraft === true,
      sentAt,
    },
    participants: [...participants.values()],
    sentAtSource,
  };
}
