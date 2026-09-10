export type ReplySourceMessage = {
  messageId: string | null;
  references: string | null;
  subject: string | null;
  senderIdentifier: string | null;
  toIdentifiers: readonly string[];
  ccIdentifiers: readonly string[];
};

export type ReplyRequest = {
  mailboxAddress: string;
  mailboxDisplayName: string | null;
  source: ReplySourceMessage;
  body: string;
  replyAll: boolean;
};

export type BuiltReply = {
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  inReplyTo: string | null;
  references: string[];
  text: string;
};

const REPLY_PREFIX = /^\s*(re|aw|antw|sv|vs|r|rif)\s*(\[\d+\])?\s*:\s*/i;
const MAX_REFERENCES = 20;

export function normaliseAddress(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;

  const trimmed = raw.trim().toLowerCase();

  return trimmed.length > 0 && trimmed.includes("@") ? trimmed : null;
}

export function uniqueAddresses(
  values: readonly (string | null | undefined)[],
  exclude: ReadonlySet<string>,
): string[] {
  const seen = new Set<string>();

  for (const value of values) {
    const address = normaliseAddress(value);
    if (!address || exclude.has(address) || seen.has(address)) continue;

    seen.add(address);
  }

  return [...seen];
}

export function replySubject(subject: string | null): string {
  const trimmed = (subject ?? "").trim();
  if (trimmed.length === 0) return "Re:";

  return REPLY_PREFIX.test(trimmed) ? trimmed.replace(REPLY_PREFIX, "Re: ") : `Re: ${trimmed}`;
}

export function replyReferences(source: ReplySourceMessage): string[] {
  const existing = (source.references ?? "")
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith("<") && entry.endsWith(">") && entry.length > 2);

  const chain = source.messageId ? [...existing, source.messageId] : existing;
  const deduped: string[] = [];

  for (const entry of chain) if (!deduped.includes(entry)) deduped.push(entry);

  return deduped.length > MAX_REFERENCES
    ? [deduped[0], ...deduped.slice(deduped.length - (MAX_REFERENCES - 1))]
    : deduped;
}

export function fromHeader(mailboxAddress: string, mailboxDisplayName: string | null): string {
  return mailboxDisplayName ? `${mailboxDisplayName} <${mailboxAddress}>` : mailboxAddress;
}

export function buildReply(request: ReplyRequest): BuiltReply {
  const self = normaliseAddress(request.mailboxAddress);
  const exclude = new Set<string>(self ? [self] : []);

  const primary = uniqueAddresses([request.source.senderIdentifier], exclude);
  const fallback = primary.length > 0 ? primary : uniqueAddresses(request.source.toIdentifiers, exclude);

  const to = request.replyAll ? uniqueAddresses([...fallback, ...request.source.toIdentifiers], exclude) : fallback;
  const cc = request.replyAll ? uniqueAddresses(request.source.ccIdentifiers, new Set([...exclude, ...to])) : [];

  return {
    from: fromHeader(request.mailboxAddress, request.mailboxDisplayName),
    to,
    cc,
    subject: replySubject(request.source.subject),
    inReplyTo: request.source.messageId,
    references: replyReferences(request.source),
    text: request.body,
  };
}
