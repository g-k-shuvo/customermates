import type { ProcessWebFormSubmissionRepo } from "./process-web-form-submission.repo";
import type { EventService } from "@/features/event/event.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";

import { DomainEvent } from "@/features/event/domain-events";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";

export const PublishLeadCreatedSchema = z.object({
  leadId: z.uuid(),
  companyId: z.uuid(),
  underTenant: z.boolean(),
});
export type PublishLeadCreatedData = Data<typeof PublishLeadCreatedSchema>;

@SystemInteractor
export class PublishLeadCreatedInteractor {
  constructor(
    private repo: ProcessWebFormSubmissionRepo,
    private eventService: EventService,
  ) {}

  @Validate(PublishLeadCreatedSchema)
  async invoke(data: PublishLeadCreatedData): Validated<null> {
    const lead = await this.repo.findLeadForEventOrThrowUnscoped(data.leadId);
    const envelope = { entityId: lead.id, payload: lead };

    if (data.underTenant) await this.eventService.publish(DomainEvent.LEAD_CREATED, envelope);
    else await this.eventService.publish(DomainEvent.LEAD_CREATED, envelope, { systemCompanyId: data.companyId });

    return { ok: true as const, data: null };
  }
}
