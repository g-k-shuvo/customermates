import type { DeleteLeadRepo } from "./delete-lead.repo";
import type { EventService } from "@/features/event/event.service";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { LeadWritePrecheckInteractor } from "../upsert/lead-write-precheck.interactor";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { BULK_WRITE_TRANSACTION } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

export const DeleteManyLeadsSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(100),
});
export type DeleteManyLeadsData = Data<typeof DeleteManyLeadsSchema>;

@TenantInteractor({ resource: Resource.leads, action: Action.delete })
export class DeleteManyLeadsInteractor extends AuthenticatedInteractor<DeleteManyLeadsData, string[]> {
  constructor(
    private repo: DeleteLeadRepo,
    private eventService: EventService,
    private precheck: LeadWritePrecheckInteractor,
  ) {
    super();
  }

  @Write({
    input: DeleteManyLeadsSchema,
    output: z.string(),
    precheck: (self, data, ctx) => self.precheck.deleteMany(data, ctx),
    tx: BULK_WRITE_TRANSACTION,
  })
  async invoke(data: DeleteManyLeadsData): Validated<string[]> {
    const previousLeads = await Promise.all(data.ids.map((id) => this.repo.getOrThrowCompanyWide(id)));

    for (const id of data.ids) await this.repo.deleteLeadOrThrow(id);

    await Promise.all(
      previousLeads.map((lead) =>
        this.eventService.publish(DomainEvent.LEAD_DELETED, {
          entityId: lead.id,
          payload: lead,
        }),
      ),
    );

    return { ok: true as const, data: data.ids };
  }
}
