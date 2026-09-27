import type { UpdateLeadRepo } from "./update-lead.repo";
import type { EventService } from "@/features/event/event.service";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { LeadWritePrecheckInteractor } from "./lead-write-precheck.interactor";

import { Resource, Action } from "@/generated/prisma";

import { type LeadDto, LeadDtoSchema } from "../lead.schema";

import { BaseUpdateLeadSchema } from "./update-lead-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { validateNotes } from "@/core/validation/validate-notes";
import { calculateChanges } from "@/core/utils/calculate-changes";

export const UpdateLeadSchema = BaseUpdateLeadSchema.superRefine((data, ctx) => {
  data.notes = validateNotes(data.notes, ctx, ["notes"]);
});
export type UpdateLeadData = Data<typeof UpdateLeadSchema>;

@TenantInteractor({
  resource: Resource.leads,
  action: Action.update,
})
export class UpdateLeadInteractor extends AuthenticatedInteractor<UpdateLeadData, LeadDto> {
  constructor(
    private repo: UpdateLeadRepo,
    private eventService: EventService,
    private precheck: LeadWritePrecheckInteractor,
  ) {
    super();
  }

  @Write({
    input: UpdateLeadSchema,
    output: LeadDtoSchema,
    precheck: (self, data, ctx) => self.precheck.update(data, ctx),
  })
  async invoke(data: UpdateLeadData): Validated<LeadDto> {
    const previousLead = await this.repo.getOrThrowCompanyWide(data.id);
    const lead = await this.repo.updateLeadOrThrow(data);

    await this.eventService.publish(DomainEvent.LEAD_UPDATED, {
      entityId: lead.id,
      payload: {
        lead,
        changes: calculateChanges(previousLead, lead),
      },
    });

    return { ok: true as const, data: lead };
  }
}
