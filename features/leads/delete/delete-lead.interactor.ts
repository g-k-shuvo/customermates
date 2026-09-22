import type { DeleteLeadRepo } from "./delete-lead.repo";
import type { EventService } from "@/features/event/event.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

export const DeleteLeadSchema = z.object({
  id: z.uuid(),
});
export type DeleteLeadData = Data<typeof DeleteLeadSchema>;

@TenantInteractor({ resource: Resource.leads, action: Action.delete })
export class DeleteLeadInteractor extends AuthenticatedInteractor<DeleteLeadData, string> {
  constructor(
    private repo: DeleteLeadRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Write({
    input: DeleteLeadSchema,
    output: z.string(),
  })
  async invoke(data: DeleteLeadData): Validated<string> {
    const previousLead = await this.repo.getOrThrowCompanyWide(data.id);
    const id = await this.repo.deleteLeadOrThrow(data.id);

    await this.eventService.publish(DomainEvent.LEAD_DELETED, {
      entityId: id,
      payload: previousLead,
    });

    return { ok: true as const, data: id };
  }
}
