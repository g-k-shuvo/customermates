import { createHash } from "node:crypto";

export const MESSAGE_KINDS = ["transactional", "marketing"] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export const SUPPRESSION_REASONS = ["unsubscribed", "bounced", "complained", "manual"] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

export const SUPPRESSION_BATCH_LIMIT = 100;

export const DEDUPE_SOURCES = ["automation", "campaign", "manual"] as const;
export type DedupeSource = (typeof DEDUPE_SOURCES)[number];

export type MessageRecipient = {
  address: string;
  contactId?: string | null;
  displayName?: string | null;
};

export type MessageSenderRef = { kind: "company" } | { kind: "user"; userId: string };

export type SendMessageRequest = {
  companyId: string;
  kind: MessageKind;
  recipient: MessageRecipient;
  sender: MessageSenderRef;
  subject: string;
  bodyMarkdown: string;
  templateId?: string | null;
  mergeRecord?: { entityType: string; entityId: string } | null;
  locale?: string | null;
  campaignId?: string | null;
  dedupeKey: string;
  idempotencyKey: string;
};

export type SendMessageOutcome =
  | { status: "sent"; deliveryId: string; providerMessageId: string | null }
  | { status: "duplicate"; deliveryId: string }
  | { status: "suppressed"; reason: SuppressionReason }
  | { status: "failed"; deliveryId: string | null; code: string };

export type SuppressionRegistry = {
  findSuppressed(companyId: string, addresses: readonly string[]): Promise<ReadonlyMap<string, SuppressionReason>>;
};

export type MessagingSender = {
  send(request: SendMessageRequest): Promise<SendMessageOutcome>;
};

export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

export function dedupeKeyFor(args: {
  source: DedupeSource;
  sourceId: string;
  recipient: string;
  occurrence?: string | null;
}): string {
  const parts = [args.source, args.sourceId, normalizeAddress(args.recipient), args.occurrence ?? ""];

  return `${args.source}:${createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 40)}`;
}

export function idempotencyKeyFor(dedupeKey: string, attempt: string): string {
  return createHash("sha256").update(`${dedupeKey}\u0000${attempt}`).digest("hex");
}

export function chunkForSuppression<T>(items: readonly T[]): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += SUPPRESSION_BATCH_LIMIT)
    chunks.push(items.slice(index, index + SUPPRESSION_BATCH_LIMIT));

  return chunks;
}
