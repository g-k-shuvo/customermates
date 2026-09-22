import type { CreateLeadRepo } from "./create-lead.repo";
import type { EventService } from "@/features/event/event.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { Resource, Action } from "@/generated/prisma";

import { type LeadDto, LeadDtoSchema } from "../lead.schema";

import { BaseCreateLeadSchema } from "./create-lead-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { validateNotes } from "@/core/validation/validate-notes";

export const CreateLeadSchema = BaseCreateLeadSchema.superRefine((data, ctx) => {
  data.notes = validateNotes(data.notes, ctx, ["notes"]);
});
export type CreateLeadData = Data<typeof CreateLeadSchema>;

@TenantInteractor({
  resource: Resource.leads,
  action: Action.create,
})
export class CreateLeadInteractor extends AuthenticatedInteractor<CreateLeadData, LeadDto> {
  constructor(
    private repo: CreateLeadRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Write({
    input: CreateLeadSchema,
    output: LeadDtoSchema,
  })
  async invoke(data: CreateLeadData): Validated<LeadDto> {
    const lead = await this.repo.createLeadOrThrow(data);

    await this.eventService.publish(DomainEvent.LEAD_CREATED, {
      entityId: lead.id,
      payload: lead,
    });

    return { ok: true as const, data: lead };
  }
}
