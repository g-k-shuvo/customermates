import type { ProcessWebFormSubmissionRepo } from "./process-web-form-submission.repo";
import type { EventService } from "@/features/event/event.service";
import type { LeadDto } from "@/features/leads/lead.schema";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";

import { DomainEvent } from "@/features/event/domain-events";
import { UserAccessor } from "@/core/base/user-accessor";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runWithoutTenant } from "@/core/decorators/tenant-context";

export const PublishLeadCreatedSchema = z.object({
  leadId: z.uuid(),
  companyId: z.uuid(),
});
export type PublishLeadCreatedData = Data<typeof PublishLeadCreatedSchema>;

export type LeadCreatedEvent = { entityId: string; payload: LeadDto };

@SystemInteractor
export class PublishLeadCreatedInteractor extends UserAccessor {
  constructor(
    private repo: ProcessWebFormSubmissionRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Validate(PublishLeadCreatedSchema)
  async invoke(data: PublishLeadCreatedData): Validated<LeadCreatedEvent> {
    const lead = await this.repo.findLeadForEventOrThrowUnscoped(data.leadId);

    return { ok: true as const, data: { entityId: lead.id, payload: lead } };
  }

  async publishAsSystem(event: LeadCreatedEvent, companyId: string): Promise<void> {
    await runWithoutTenant(() =>
      this.eventService.publish(DomainEvent.LEAD_CREATED, event, { systemCompanyId: companyId }),
    );
  }

  async publishAsTenant(event: LeadCreatedEvent, companyId: string): Promise<void> {
    if (this.companyId !== companyId)
      throw new Error(`lead.created of company ${companyId} refused under a tenant of company ${this.companyId}`);

    await this.eventService.publish(DomainEvent.LEAD_CREATED, event);
  }
}
