import type { UpdateLeadRepo } from "./update-lead.repo";
import type { EventService } from "@/features/event/event.service";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { LeadWritePrecheckInteractor } from "./lead-write-precheck.interactor";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { type LeadDto, LeadDtoSchema } from "../lead.schema";

import { BaseCreateLeadSchema } from "./create-lead-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { BULK_WRITE_TRANSACTION } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { validateNotes } from "@/core/validation/validate-notes";

export const UpdateManyLeadsSchema = z.object({
  leads: z
    .array(
      BaseCreateLeadSchema.partial()
        .extend({ id: z.uuid() })
        .superRefine((lead, ctx) => {
          lead.notes = validateNotes(lead.notes, ctx, ["notes"]);
        }),
    )
    .min(1)
    .max(100),
});
export type UpdateManyLeadsData = Data<typeof UpdateManyLeadsSchema>;

@TenantInteractor({
  resource: Resource.leads,
  action: Action.update,
})
export class UpdateManyLeadsInteractor extends AuthenticatedInteractor<UpdateManyLeadsData, LeadDto[]> {
  constructor(
    private repo: UpdateLeadRepo,
    private eventService: EventService,
    private precheck: LeadWritePrecheckInteractor,
  ) {
    super();
  }

  @Write({
    input: UpdateManyLeadsSchema,
    output: LeadDtoSchema,
    precheck: (self, data, ctx) => self.precheck.updateMany(data, ctx),
    tx: BULK_WRITE_TRANSACTION,
  })
  async invoke(data: UpdateManyLeadsData): Validated<LeadDto[]> {
    const previousLeads = await Promise.all(data.leads.map((lead) => this.repo.getOrThrowCompanyWide(lead.id)));
    const previousById = new Map(previousLeads.map((lead) => [lead.id, lead]));

    const leads = await Promise.all(data.leads.map((leadData) => this.repo.updateLeadOrThrow(leadData)));

    await Promise.all(
      leads.map((lead) =>
        this.eventService.publish(DomainEvent.LEAD_UPDATED, {
          entityId: lead.id,
          payload: { lead, changes: calculateChanges(previousById.get(lead.id) ?? lead, lead) },
        }),
      ),
    );

    return { ok: true as const, data: leads };
  }
}
