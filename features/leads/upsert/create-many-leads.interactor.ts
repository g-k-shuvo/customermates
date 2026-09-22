import type { CreateLeadRepo } from "./create-lead.repo";
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
import { validateNotes } from "@/core/validation/validate-notes";

export const CreateManyLeadsSchema = z.object({
  leads: z
    .array(
      BaseCreateLeadSchema.superRefine((lead, ctx) => {
        lead.notes = validateNotes(lead.notes, ctx, ["notes"]);
      }),
    )
    .min(1)
    .max(100),
});
export type CreateManyLeadsData = Data<typeof CreateManyLeadsSchema>;

@TenantInteractor({
  resource: Resource.leads,
  action: Action.create,
})
export class CreateManyLeadsInteractor extends AuthenticatedInteractor<CreateManyLeadsData, LeadDto[]> {
  constructor(
    private repo: CreateLeadRepo,
    private eventService: EventService,
    private precheck: LeadWritePrecheckInteractor,
  ) {
    super();
  }

  @Write({
    input: CreateManyLeadsSchema,
    output: LeadDtoSchema,
    precheck: (self, data, ctx) => self.precheck.createMany(data, ctx),
    tx: BULK_WRITE_TRANSACTION,
  })
  async invoke(data: CreateManyLeadsData): Validated<LeadDto[]> {
    const leads = await Promise.all(data.leads.map((leadData) => this.repo.createLeadOrThrow(leadData)));

    await Promise.all(
      leads.map((lead) => this.eventService.publish(DomainEvent.LEAD_CREATED, { entityId: lead.id, payload: lead })),
    );

    return { ok: true as const, data: leads };
  }
}
