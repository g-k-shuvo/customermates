import type { MarkDealLostRepo } from "./mark-deal-lost.repo";
import type { EventService } from "@/features/event/event.service";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { DealWritePrecheckInteractor } from "../upsert/deal-write-precheck.interactor";

import { Resource, Action, DealStatus } from "@/generated/prisma";
import { z } from "zod";

import { type DealDto, DealDtoSchema } from "../deal.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { failConflict } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

export const MarkDealLostSchema = z.object({
  id: z.uuid(),
  lostReasonId: z.uuid(),
  lostNotes: z.string().max(2000).nullish(),
});
export type MarkDealLostData = Data<typeof MarkDealLostSchema>;

@TenantInteractor({ resource: Resource.deals, action: Action.update })
export class MarkDealLostInteractor extends AuthenticatedInteractor<MarkDealLostData, DealDto> {
  constructor(
    private repo: MarkDealLostRepo,
    private eventService: EventService,
    private precheck: DealWritePrecheckInteractor,
  ) {
    super();
  }

  @Write({
    input: MarkDealLostSchema,
    output: DealDtoSchema,
    precheck: (self, data, ctx) => self.precheck.markLost(data, ctx),
  })
  async invoke(data: MarkDealLostData): Validated<DealDto> {
    const previousDeal = await this.repo.getOrThrowCompanyWide(data.id);

    if (previousDeal.status !== DealStatus.open) return failConflict(CustomErrorCode.dealAlreadyClosed, ["id"]);

    const deal = await this.repo.markDealLostOrThrow({
      id: data.id,
      lostReasonId: data.lostReasonId,
      lostNotes: data.lostNotes ?? null,
    });

    if (!deal) return failConflict(CustomErrorCode.dealAlreadyClosed, ["id"]);

    await this.eventService.publish(DomainEvent.DEAL_UPDATED, {
      entityId: deal.id,
      payload: {
        deal,
        changes: calculateChanges(previousDeal, deal),
      },
    });

    return { ok: true as const, data: deal };
  }
}
