import type { ClaimedDelivery, MessageDeliveryRepo, NewMessageDelivery } from "./message-delivery.repo";

import { MessageDeliveryStatus, type SuppressionReason } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";

export class PrismaMessageDeliveryRepo extends BaseRepository implements MessageDeliveryRepo {
  async claimDeliveryOrThrow(delivery: NewMessageDelivery): Promise<ClaimedDelivery> {
    const inserted = await this.prisma.messageDelivery.createMany({
      data: [{ companyId: this.companyId, status: MessageDeliveryStatus.sending, ...delivery }],
      skipDuplicates: true,
    });
    const row = await this.prisma.messageDelivery.findFirstOrThrow({
      where: { companyId: this.companyId, dedupeKey: delivery.dedupeKey },
      select: { id: true, status: true },
    });

    if (inserted.count === 1) return { claimed: true, id: row.id };
    if (row.status !== MessageDeliveryStatus.failed) return { claimed: false, ...row };

    const retried = await this.prisma.messageDelivery.updateMany({
      where: { id: row.id, companyId: this.companyId, status: MessageDeliveryStatus.failed },
      data: {
        status: MessageDeliveryStatus.sending,
        idempotencyKey: delivery.idempotencyKey,
        error: null,
        attempts: { increment: 1 },
      },
    });

    return retried.count === 1
      ? { claimed: true, id: row.id }
      : { claimed: false, id: row.id, status: MessageDeliveryStatus.sending };
  }

  async markSent(id: string, args: { transport: string; providerMessageId: string | null }): Promise<void> {
    await this.prisma.messageDelivery.updateMany({
      where: { id, companyId: this.companyId },
      data: { status: MessageDeliveryStatus.sent, sentAt: new Date(), error: null, ...args },
    });
  }

  async markSuppressed(id: string, reason: SuppressionReason): Promise<void> {
    await this.prisma.messageDelivery.updateMany({
      where: { id, companyId: this.companyId },
      data: { status: MessageDeliveryStatus.suppressed, error: reason },
    });
  }

  async markFailed(id: string, args: { transport: string | null; error: string }): Promise<void> {
    await this.prisma.messageDelivery.updateMany({
      where: { id, companyId: this.companyId },
      data: { status: MessageDeliveryStatus.failed, ...args },
    });
  }
}
