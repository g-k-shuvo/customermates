import type { BuiltReply } from "./build-reply";

import { fromHeader, normaliseAddress, uniqueAddresses } from "./build-reply";

export type ForwardSourceMessage = {
  subject: string | null;
  senderIdentifier: string | null;
  senderDisplayName: string | null;
  toIdentifiers: readonly string[];
  ccIdentifiers: readonly string[];
  sentAt: Date | null;
  bodyText: string | null;
};

export type ForwardRequest = {
  mailboxAddress: string;
  mailboxDisplayName: string | null;
  recipients: readonly string[];
  source: ForwardSourceMessage;
  body: string;
};

const FORWARD_PREFIX = /^\s*(fwd?|wg|tr|rv|doorst|vs)\s*(\[\d+\])?\s*:\s*/i;
const FORWARD_BANNER = "---------- Forwarded message ----------";
const EMPTY_SUBJECT = "Fwd:";

export function forwardSubject(subject: string | null): string {
  const trimmed = (subject ?? "").trim();
  if (trimmed.length === 0) return EMPTY_SUBJECT;

  return FORWARD_PREFIX.test(trimmed) ? trimmed.replace(FORWARD_PREFIX, "Fwd: ") : `Fwd: ${trimmed}`;
}

function headerLine(label: string, value: string | null): string[] {
  return value && value.length > 0 ? [`${label}: ${value}`] : [];
}

function addressList(values: readonly string[]): string | null {
  const addresses = uniqueAddresses(values, new Set<string>());

  return addresses.length > 0 ? addresses.join(", ") : null;
}

function senderLine(source: ForwardSourceMessage): string | null {
  const address = normaliseAddress(source.senderIdentifier);
  if (!address) return null;

  const displayName = (source.senderDisplayName ?? "").trim();

  return displayName.length > 0 ? `${displayName} <${address}>` : address;
}

export function quoteForwardedMessage(source: ForwardSourceMessage): string {
  const headers = [
    ...headerLine("From", senderLine(source)),
    ...headerLine("Date", source.sentAt ? source.sentAt.toISOString() : null),
    ...headerLine("Subject", (source.subject ?? "").trim() || null),
    ...headerLine("To", addressList(source.toIdentifiers)),
    ...headerLine("Cc", addressList(source.ccIdentifiers)),
  ];

  const body = (source.bodyText ?? "").trim();
  const quoted = [FORWARD_BANNER, ...headers].join("\n");

  return body.length > 0 ? `${quoted}\n\n${body}` : quoted;
}

export function buildForward(request: ForwardRequest): BuiltReply {
  const body = request.body.trim();
  const quoted = quoteForwardedMessage(request.source);

  return {
    from: fromHeader(request.mailboxAddress, request.mailboxDisplayName),
    to: uniqueAddresses(request.recipients, new Set<string>()),
    cc: [],
    subject: forwardSubject(request.source.subject),
    inReplyTo: null,
    references: [],
    text: body.length > 0 ? `${body}\n\n${quoted}` : quoted,
  };
}
