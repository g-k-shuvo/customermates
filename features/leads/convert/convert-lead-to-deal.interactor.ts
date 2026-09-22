import type { ConvertLeadToDealRepo } from "./convert-lead-to-deal.repo";
import type { CreateDealRepo } from "@/features/deals/upsert/create-deal.repo";
import type { EventService } from "@/features/event/event.service";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { LeadWritePrecheckInteractor } from "../upsert/lead-write-precheck.interactor";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { type DealDto, DealDtoSchema } from "@/features/deals/deal.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { BULK_WRITE_TRANSACTION } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { failConflict } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { zx } from "@/core/validation/validation.utils";

export const ConvertLeadToDealSchema = z.object({
  id: z.uuid(),
  name: zx.nonBlankText(255).optional(),
  pipelineId: z.uuid().optional(),
  stageId: z.uuid().optional(),
  expectedCloseDate: zx.isoDateTime().optional(),
  probability: z.number().min(0).max(100).optional(),
});
export type ConvertLeadToDealData = Data<typeof ConvertLeadToDealSchema>;

@TenantInteractor({
  permissions: [
    { resource: Resource.leads, action: Action.update },
    { resource: Resource.deals, action: Action.create },
  ],
  condition: "AND",
})
export class ConvertLeadToDealInteractor extends AuthenticatedInteractor<ConvertLeadToDealData, DealDto> {
  constructor(
    private repo: ConvertLeadToDealRepo,
    private dealRepo: CreateDealRepo,
    private eventService: EventService,
    private precheck: LeadWritePrecheckInteractor,
  ) {
    super();
  }

  @Write({
    input: ConvertLeadToDealSchema,
    output: DealDtoSchema,
    tx: BULK_WRITE_TRANSACTION,
    precheck: (self, data, ctx) => self.precheck.convert(data, ctx),
  })
  async invoke(data: ConvertLeadToDealData): Validated<DealDto> {
    const lead = await this.repo.getOrThrowCompanyWide(data.id);

    if (lead.convertedDealId) return failConflict(CustomErrorCode.leadAlreadyConverted, ["id"]);

    const deal = await this.dealRepo.createDealOrThrow({
      name: data.name ?? lead.title,
      notes: lead.notes ?? null,
      pipelineId: data.pipelineId,
      stageId: data.stageId,
      expectedCloseDate: data.expectedCloseDate,
      probability: data.probability,
      contactIds: lead.contact ? [lead.contact.id] : [],
      organizationIds: lead.organization ? [lead.organization.id] : [],
      userIds: lead.owner ? [lead.owner.id] : [],
      services: [],
      taskIds: [],
      customFieldValues: [],
    });

    const convertedLead = await this.repo.markLeadConvertedOrThrow({
      id: lead.id,
      dealId: deal.id,
      convertedAt: new Date(),
    });

    await Promise.all([
      this.eventService.publish(DomainEvent.DEAL_CREATED, { entityId: deal.id, payload: deal }),
      this.eventService.publish(DomainEvent.LEAD_UPDATED, {
        entityId: convertedLead.id,
        payload: { lead: convertedLead, changes: calculateChanges(lead, convertedLead) },
      }),
    ]);

    return { ok: true as const, data: deal };
  }
}
