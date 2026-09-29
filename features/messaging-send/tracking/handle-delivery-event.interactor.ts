import type { DeliveryTrackingRepo } from "./delivery-tracking.repo";
import type { DeliveryEvent } from "./resend-event";
import type { Validated } from "@/core/validation/validation.utils";

import { MessageDeliveryEventKind, MessageDeliveryStatus, SuppressionReason } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

export type HandledDeliveryEvent = { handled: boolean; duplicate: boolean };

const SETTLED = [MessageDeliveryStatus.sent, MessageDeliveryStatus.delivered] as const;

@SystemInteractor
export class HandleDeliveryEventInteractor {
  constructor(private repo: DeliveryTrackingRepo) {}

  async invoke(event: DeliveryEvent): Validated<HandledDeliveryEvent> {
    const delivery = await this.repo.findDeliveryByProviderMessageIdUnscoped(event.providerMessageId);
    if (!delivery) return { ok: true as const, data: { handled: false, duplicate: false } };

    const recorded = await this.repo.recordEventUnscoped({
      delivery,
      kind: event.kind,
      occurredAt: event.occurredAt,
      providerEventId: event.providerEventId,
      detail: event.detail,
    });
    if (!recorded) return { ok: true as const, data: { handled: true, duplicate: true } };

    if (event.kind === MessageDeliveryEventKind.delivered) {
      await this.repo.advanceStatusUnscoped({
        delivery,
        status: MessageDeliveryStatus.delivered,
        from: [MessageDeliveryStatus.sent],
      });
    }

    if (event.suppresses && delivery.recipient) {
      const complained = event.kind === MessageDeliveryEventKind.complained;

      await this.repo.advanceStatusUnscoped({
        delivery,
        status: complained ? MessageDeliveryStatus.complained : MessageDeliveryStatus.bounced,
        from: complained ? [...SETTLED, MessageDeliveryStatus.bounced] : SETTLED,
      });
      await this.repo.suppressAddressUnscoped({
        delivery,
        reason: complained ? SuppressionReason.complained : SuppressionReason.bounced,
      });
    }

    return { ok: true as const, data: { handled: true, duplicate: false } };
  }
}
