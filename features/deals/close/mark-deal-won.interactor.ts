import type { MarkDealWonRepo } from "./mark-deal-won.repo";
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

export const MarkDealWonSchema = z.object({
  id: z.uuid(),
});
export type MarkDealWonData = Data<typeof MarkDealWonSchema>;

@TenantInteractor({ resource: Resource.deals, action: Action.update })
export class MarkDealWonInteractor extends AuthenticatedInteractor<MarkDealWonData, DealDto> {
  constructor(
    private repo: MarkDealWonRepo,
    private eventService: EventService,
    private precheck: DealWritePrecheckInteractor,
  ) {
    super();
  }

  @Write({
    input: MarkDealWonSchema,
    output: DealDtoSchema,
    precheck: (self, data, ctx) => self.precheck.markWon(data, ctx),
  })
  async invoke(data: MarkDealWonData): Validated<DealDto> {
    const previousDeal = await this.repo.getOrThrowCompanyWide(data.id);

    if (previousDeal.status !== DealStatus.open) return failConflict(CustomErrorCode.dealAlreadyClosed, ["id"]);

    const deal = await this.repo.markDealWonOrThrow(data.id);

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
