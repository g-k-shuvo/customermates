import type { MessageDeliveryStatus, MessageKind, SuppressionReason } from "@/generated/prisma";

export type NewMessageDelivery = {
  kind: MessageKind;
  source: string;
  dedupeKey: string;
  idempotencyKey: string;
  automationRunStepId: string | null;
  campaignId: string | null;
  recipient: string;
  contactId: string | null;
  subject: string;
};

export type ClaimedDelivery =
  | { claimed: true; id: string }
  | { claimed: false; id: string; status: MessageDeliveryStatus };

export abstract class MessageDeliveryRepo {
  abstract claimDeliveryOrThrow(delivery: NewMessageDelivery): Promise<ClaimedDelivery>;
  abstract markSent(id: string, args: { transport: string; providerMessageId: string | null }): Promise<void>;
  abstract markFailed(id: string, args: { transport: string | null; error: string }): Promise<void>;
  abstract markSuppressed(id: string, reason: SuppressionReason): Promise<void>;
}
