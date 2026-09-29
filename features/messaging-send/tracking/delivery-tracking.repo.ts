import type { MessageDeliveryEventKind, MessageDeliveryStatus, SuppressionReason } from "@/generated/prisma";

export type TrackedDelivery = { id: string; companyId: string; recipient: string; status: MessageDeliveryStatus };

export abstract class DeliveryTrackingRepo {
  abstract findDeliveryByProviderMessageIdUnscoped(providerMessageId: string): Promise<TrackedDelivery | null>;

  abstract recordEventUnscoped(args: {
    delivery: TrackedDelivery;
    kind: MessageDeliveryEventKind;
    occurredAt: Date;
    providerEventId: string | null;
    detail: string | null;
  }): Promise<boolean>;

  abstract advanceStatusUnscoped(args: {
    delivery: TrackedDelivery;
    status: MessageDeliveryStatus;
    from: readonly MessageDeliveryStatus[];
  }): Promise<void>;

  abstract suppressAddressUnscoped(args: { delivery: TrackedDelivery; reason: SuppressionReason }): Promise<void>;
}
