import type { AutomationDto } from "../automation.schema";
import type { EventService } from "@/features/event/event.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import z from "zod";
import { Action, Resource } from "@/generated/prisma";

import { AutomationDtoSchema } from "../automation.schema";
import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

export const DeleteAutomationSchema = z.object({ id: z.uuid() });
export type DeleteAutomationData = Data<typeof DeleteAutomationSchema>;

export abstract class DeleteAutomationRepo {
  abstract deleteAutomationOrThrow(id: string): Promise<AutomationDto>;
}

@TenantInteractor({ resource: Resource.automations, action: Action.delete })
export class DeleteAutomationInteractor extends AuthenticatedInteractor<DeleteAutomationData, AutomationDto> {
  constructor(
    private repo: DeleteAutomationRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Write({ input: DeleteAutomationSchema, output: AutomationDtoSchema })
  async invoke(data: DeleteAutomationData): Validated<AutomationDto> {
    const automation = await this.repo.deleteAutomationOrThrow(data.id);

    await this.eventService.publish(DomainEvent.AUTOMATION_DELETED, {
      entityId: automation.id,
      payload: { id: automation.id, name: automation.name },
    });

    return { ok: true as const, data: automation };
  }
}
