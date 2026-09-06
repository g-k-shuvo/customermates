import { createHash } from "node:crypto";

export type ThreadKeySource = "references" | "in-reply-to" | "message-id" | "subject";

export type ThreadKey = {
  value: string;
  source: ThreadKeySource;
};

export type MessageIdListInput = string | readonly (string | null | undefined)[] | null | undefined;

export type ParticipantListInput = readonly (string | null | undefined)[] | null | undefined;

export type ThreadingHeaders = {
  messageId?: string | null;
  inReplyTo?: MessageIdListInput;
  references?: MessageIdListInput;
  subject?: string | null;
  participants?: ParticipantListInput;
};

export const MESSAGE_ID_THREAD_KEY_PREFIX = "imap:thread:";
export const SUBJECT_THREAD_KEY_PREFIX = "imap:subject:";

const ANGLE_BRACKETED_MESSAGE_ID_TOKEN = /<[^<>]*>/g;
const MESSAGE_ID_TOKEN = /<[^<>]*>|[^\s,<>]+/g;
const FORBIDDEN_IN_ADDR_SPEC = /[\s,<>();:"\\]/;
const FIRST_PRINTABLE_ASCII = 0x21;
const LAST_PRINTABLE_ASCII = 0x7e;
const LAST_C1_CONTROL = 0x9f;
const RFC_5322_MAX_LINE_LENGTH = 998;
const LAST_ANGLE_ADDRESS = /<([^<>]*)>[^<>]*$/;
const REPLY_PREFIX = /^\s*(?:antw|fwd|rif|aw|fw|re|rv|sv|tr|vs|wg|r)\s*(?:[[(]\s*\d+\s*[\])])?\s*:\s*/i;
const WHITESPACE_RUN = /\s+/g;
const PARTICIPANT_SEPARATOR = ",";
const KEY_FIELD_SEPARATOR = ":";

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < FIRST_PRINTABLE_ASCII) return true;
    if (code > LAST_PRINTABLE_ASCII && code <= LAST_C1_CONTROL) return true;
  }

  return false;
}

function isAddrSpecShaped(value: string): boolean {
  if (value.length > RFC_5322_MAX_LINE_LENGTH) return false;

  const domainStart = value.lastIndexOf("@");
  if (domainStart <= 0 || domainStart === value.length - 1) return false;
  if (FORBIDDEN_IN_ADDR_SPEC.test(value)) return false;

  return !hasControlCharacter(value);
}

function lowercaseDomainKeepingLocalPartCase(addrSpec: string): string {
  const domainStart = addrSpec.lastIndexOf("@");

  return `${addrSpec.slice(0, domainStart)}@${addrSpec.slice(domainStart + 1).toLowerCase()}`;
}

export function normalizeMessageId(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  const unbracketed = trimmed.startsWith("<") && trimmed.endsWith(">") ? trimmed.slice(1, -1).trim() : trimmed;
  if (!isAddrSpecShaped(unbracketed)) return null;

  return lowercaseDomainKeepingLocalPartCase(unbracketed);
}

function headerText(raw: MessageIdListInput): string {
  if (typeof raw === "string") return raw;
  if (!Array.isArray(raw)) return "";

  return raw.filter((entry): entry is string => typeof entry === "string").join(" ");
}

function messageIdsFromTokens(tokens: readonly string[]): string[] {
  const messageIds: string[] = [];
  for (const token of tokens) {
    const messageId = normalizeMessageId(token);
    if (messageId) messageIds.push(messageId);
  }

  return messageIds;
}

export function parseMessageIdList(raw: MessageIdListInput): string[] {
  const text = headerText(raw);
  const angleBracketed = messageIdsFromTokens(text.match(ANGLE_BRACKETED_MESSAGE_ID_TOKEN) ?? []);
  if (angleBracketed.length > 0) return angleBracketed;

  return messageIdsFromTokens(text.match(MESSAGE_ID_TOKEN) ?? []);
}

export function normalizeSubject(raw: string | null | undefined): string {
  let subject = (raw ?? "").replace(WHITESPACE_RUN, " ").trim();
  while (REPLY_PREFIX.test(subject)) subject = subject.replace(REPLY_PREFIX, "");

  return subject.trim().toLowerCase();
}

function byCodeUnitOrder(left: string, right: string): number {
  if (left < right) return -1;

  return left > right ? 1 : 0;
}

function participantAddress(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  const angled = LAST_ANGLE_ADDRESS.exec(trimmed);
  const address = (angled ? angled[1] : trimmed).trim().toLowerCase();

  return isAddrSpecShaped(address) ? address : null;
}

export function normalizeParticipantAddresses(raw: ParticipantListInput): string[] {
  const addresses = new Set<string>();
  for (const entry of raw ?? []) {
    const address = participantAddress(entry);
    if (address) addresses.add(address);
  }

  return [...addresses].sort(byCodeUnitOrder);
}

function lengthPrefixed(value: string): string {
  return `${value.length}${KEY_FIELD_SEPARATOR}${value}`;
}

export function subjectThreadKey(
  subject: string | null | undefined,
  participants: ParticipantListInput,
): string | null {
  const normalizedSubject = normalizeSubject(subject);
  if (!normalizedSubject) return null;

  const addresses = normalizeParticipantAddresses(participants).join(PARTICIPANT_SEPARATOR);
  const material = `${lengthPrefixed(normalizedSubject)}${KEY_FIELD_SEPARATOR}${addresses}`;

  return `${SUBJECT_THREAD_KEY_PREFIX}${createHash("sha256").update(material, "utf8").digest("hex")}`;
}

type ConversationRoot = {
  messageId: string;
  source: Exclude<ThreadKeySource, "subject">;
};

function conversationRoot(headers: ThreadingHeaders): ConversationRoot | null {
  const referenced = parseMessageIdList(headers.references).at(0);
  if (referenced) return { messageId: referenced, source: "references" };

  const repliedTo = parseMessageIdList(headers.inReplyTo).at(0);
  if (repliedTo) return { messageId: repliedTo, source: "in-reply-to" };

  const own = normalizeMessageId(headers.messageId);
  if (own) return { messageId: own, source: "message-id" };

  return null;
}

export function conversationRootMessageId(headers: ThreadingHeaders): string | null {
  return conversationRoot(headers)?.messageId ?? null;
}

export function threadKey(headers: ThreadingHeaders): ThreadKey | null {
  const root = conversationRoot(headers);
  if (root) return { value: `${MESSAGE_ID_THREAD_KEY_PREFIX}${root.messageId}`, source: root.source };

  const subjectKey = subjectThreadKey(headers.subject, headers.participants);
  if (!subjectKey) return null;

  return { value: subjectKey, source: "subject" };
}
