import type { DeliveryTrackingRepo, TrackedDelivery } from "./delivery-tracking.repo";
import type { MessageDeliveryEventKind, MessageDeliveryStatus, SuppressionReason } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";

export class PrismaDeliveryTrackingRepo extends BaseRepository implements DeliveryTrackingRepo {
  @BypassTenantGuard
  async findDeliveryByProviderMessageIdUnscoped(providerMessageId: string): Promise<TrackedDelivery | null> {
    return await this.prisma.messageDelivery.findFirst({
      where: { providerMessageId },
      select: { id: true, companyId: true, recipient: true, status: true },
    });
  }

  @BypassTenantGuard
  async recordEventUnscoped(args: {
    delivery: TrackedDelivery;
    kind: MessageDeliveryEventKind;
    occurredAt: Date;
    providerEventId: string | null;
    detail: string | null;
  }): Promise<boolean> {
    const { count } = await this.prisma.messageDeliveryEvent.createMany({
      data: [
        {
          companyId: args.delivery.companyId,
          deliveryId: args.delivery.id,
          kind: args.kind,
          occurredAt: args.occurredAt,
          providerEventId: args.providerEventId,
          detail: args.detail,
        },
      ],
      skipDuplicates: true,
    });

    return count === 1;
  }

  @BypassTenantGuard
  async advanceStatusUnscoped(args: {
    delivery: TrackedDelivery;
    status: MessageDeliveryStatus;
    from: readonly MessageDeliveryStatus[];
  }): Promise<void> {
    await this.prisma.messageDelivery.updateMany({
      where: { id: args.delivery.id, companyId: args.delivery.companyId, status: { in: [...args.from] } },
      data: { status: args.status },
    });
  }

  @BypassTenantGuard
  async suppressAddressUnscoped(args: { delivery: TrackedDelivery; reason: SuppressionReason }): Promise<void> {
    await this.prisma.messageSuppression.createMany({
      data: [
        {
          companyId: args.delivery.companyId,
          address: args.delivery.recipient,
          reason: args.reason,
          deliveryId: args.delivery.id,
        },
      ],
      skipDuplicates: true,
    });
  }
}
