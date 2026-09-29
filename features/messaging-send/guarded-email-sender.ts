import type React from "react";
import type { EmailService } from "@/features/email/email.service";
import type { MessageDeliveryRepo } from "./message-delivery.repo";
import type { DedupeSource, SendMessageOutcome } from "./messaging-send.contract";
import type { SuppressionRepo, UnsubscribeTokenRepo } from "./suppression/suppression.repo";
import type { SenderResolver } from "./sender/sender-resolver";

import { createHash, randomBytes } from "node:crypto";

import { MessageKind } from "@/generated/prisma";

import { dedupeKeyFor, idempotencyKeyFor, normalizeAddress } from "./messaging-send.contract";

export const DELIVERY_REJECTED = "deliveryRejected";
export const DELIVERY_TRANSPORT_ERROR = "deliveryTransportError";

export type RenderContext = { unsubscribeUrl: string | null };

export type GuardedEmail = {
  kind?: MessageKind;
  source: DedupeSource;
  sourceId: string;
  occurrence?: string | null;
  automationRunStepId?: string | null;
  campaignId?: string | null;
  to: string;
  contactId?: string | null;
  subject: string;
  render: (context: RenderContext) => React.ReactElement<Record<string, unknown>>;
  senderUserId?: string | null;
  from?: string;
  replyTo?: string;
};

export type UnsubscribeLinks = {
  suppressions: SuppressionRepo;
  tokens: UnsubscribeTokenRepo;
  baseUrl: string;
};

export function hashUnsubscribeToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function unsubscribeUrlFor(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/api/unsubscribe/${token}`;
}

export class GuardedEmailSender {
  constructor(
    private repo: MessageDeliveryRepo,
    private email: EmailService,
    private unsubscribe: UnsubscribeLinks,
    private senders: SenderResolver,
  ) {}

  async send(message: GuardedEmail): Promise<SendMessageOutcome> {
    const kind = message.kind ?? MessageKind.transactional;
    const recipient = normalizeAddress(message.to);
    const dedupeKey = dedupeKeyFor({
      source: message.source,
      sourceId: message.sourceId,
      recipient,
      occurrence: message.occurrence,
    });
    const claim = await this.repo.claimDeliveryOrThrow({
      kind,
      source: message.source,
      dedupeKey,
      idempotencyKey: idempotencyKeyFor(dedupeKey, new Date().toISOString()),
      automationRunStepId: message.automationRunStepId ?? null,
      campaignId: message.campaignId ?? null,
      recipient,
      contactId: message.contactId ?? null,
      subject: message.subject,
    });

    if (!claim.claimed) return { status: "duplicate", deliveryId: claim.id };

    const sender = await this.senders.resolve(message.senderUserId ?? null);
    if (!sender.ok) {
      await this.repo.markFailed(claim.id, { transport: null, error: sender.code });
      return { status: "failed", deliveryId: claim.id, code: sender.code };
    }

    let unsubscribeUrl: string | null = null;
    if (kind === MessageKind.marketing) {
      const reason = (await this.unsubscribe.suppressions.findSuppressed([recipient])).get(recipient);
      if (reason) {
        await this.repo.markSuppressed(claim.id, reason);
        return { status: "suppressed", reason };
      }

      const token = randomBytes(32).toString("base64url");
      await this.unsubscribe.tokens.storeToken({
        tokenHash: hashUnsubscribeToken(token),
        address: recipient,
        deliveryId: claim.id,
      });
      unsubscribeUrl = unsubscribeUrlFor(this.unsubscribe.baseUrl, token);
    }

    let receipt;
    try {
      receipt = await this.email.deliver({
        to: message.to,
        subject: message.subject,
        react: message.render({ unsubscribeUrl }),
        from: sender.from ?? message.from,
        replyTo: sender.replyTo ?? message.replyTo,
        ...(unsubscribeUrl
          ? {
              headers: {
                "List-Unsubscribe": `<${unsubscribeUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              },
            }
          : {}),
      });
    } catch (error) {
      await this.repo.markFailed(claim.id, {
        transport: null,
        error: error instanceof Error ? error.message.slice(0, 500) : DELIVERY_TRANSPORT_ERROR,
      });
      return { status: "failed", deliveryId: claim.id, code: DELIVERY_TRANSPORT_ERROR };
    }

    if (!receipt.accepted) {
      await this.repo.markFailed(claim.id, { transport: receipt.transport, error: DELIVERY_REJECTED });
      return { status: "failed", deliveryId: claim.id, code: DELIVERY_REJECTED };
    }

    await this.repo.markSent(claim.id, {
      transport: receipt.transport,
      providerMessageId: receipt.providerMessageId,
    });

    return { status: "sent", deliveryId: claim.id, providerMessageId: receipt.providerMessageId };
  }
}
