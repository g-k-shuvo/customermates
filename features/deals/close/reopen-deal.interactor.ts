import type { ReopenDealRepo } from "./reopen-deal.repo";
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

export const ReopenDealSchema = z.object({
  id: z.uuid(),
  stageId: z.uuid().nullish(),
});
export type ReopenDealData = Data<typeof ReopenDealSchema>;

@TenantInteractor({ resource: Resource.deals, action: Action.update })
export class ReopenDealInteractor extends AuthenticatedInteractor<ReopenDealData, DealDto> {
  constructor(
    private repo: ReopenDealRepo,
    private eventService: EventService,
    private precheck: DealWritePrecheckInteractor,
  ) {
    super();
  }

  @Write({
    input: ReopenDealSchema,
    output: DealDtoSchema,
    precheck: (self, data, ctx) => self.precheck.reopen(data, ctx),
  })
  async invoke(data: ReopenDealData): Validated<DealDto> {
    const previousDeal = await this.repo.getOrThrowCompanyWide(data.id);

    if (previousDeal.status === DealStatus.open) return failConflict(CustomErrorCode.dealNotClosed, ["id"]);

    const deal = await this.repo.reopenDealOrThrow({ id: data.id, stageId: data.stageId ?? null });

    if (!deal) return failConflict(CustomErrorCode.dealNotClosed, ["id"]);

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
