import type { AutomationDto } from "../automation.schema";
import type { EventService } from "@/features/event/event.service";
import type { Data } from "@/core/validation/validation.utils";
import type { z as zType } from "zod";

import z from "zod";
import { Action, AutomationTriggerKind, Resource } from "@/generated/prisma";

import {
  AUTOMATION_DESCRIPTION_MAX_LENGTH,
  AUTOMATION_MAX_CHANGED_FIELDS,
  AUTOMATION_MAX_STEPS,
  AUTOMATION_NAME_MAX_LENGTH,
  AutomationDtoSchema,
  AutomationTriggerEntityTypeSchema,
} from "../automation.schema";
import { AutomationStepSchema } from "../automation-action.schema";
import { isSupportedAutomationSchedule } from "../automation-schedule";
import { assertActionsFitEntity } from "../automation-action-support";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { type Validated } from "@/core/validation/validation.utils";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { FilterSchema } from "@/core/base/base-get.schema";

export const UpsertAutomationSchema = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1).max(AUTOMATION_NAME_MAX_LENGTH).optional(),
    description: z.string().max(AUTOMATION_DESCRIPTION_MAX_LENGTH).nullable().optional(),
    enabled: z.boolean().optional(),
    entityType: AutomationTriggerEntityTypeSchema.nullable().optional(),
    triggerKind: z.enum(AutomationTriggerKind).optional(),
    changedFields: z.array(z.string().trim().min(1).max(100)).max(AUTOMATION_MAX_CHANGED_FIELDS).optional(),
    conditions: z.array(FilterSchema).max(50).nullable().optional(),
    schedule: z.string().trim().min(1).max(100).nullable().optional(),
    scheduleTimeZone: z.string().trim().min(1).max(100).nullable().optional(),
    steps: z.array(AutomationStepSchema).min(1).max(AUTOMATION_MAX_STEPS).optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.id) {
      if (data.name === undefined)
        ctx.addIssue({ code: "custom", path: ["name"], params: { error: CustomErrorCode.automationNameRequired } });
      if (data.triggerKind === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["triggerKind"],
          params: { error: CustomErrorCode.automationTriggerRequired },
        });
      }
      if (data.steps === undefined)
        ctx.addIssue({ code: "custom", path: ["steps"], params: { error: CustomErrorCode.automationStepsRequired } });
    }

    if (data.triggerKind === AutomationTriggerKind.schedule) {
      if (!data.schedule) {
        ctx.addIssue({
          code: "custom",
          path: ["schedule"],
          params: { error: CustomErrorCode.automationScheduleRequired },
        });
      } else if (!isSupportedAutomationSchedule(data.schedule)) {
        ctx.addIssue({
          code: "custom",
          path: ["schedule"],
          params: { error: CustomErrorCode.automationScheduleInvalid },
        });
      }
    } else if (data.triggerKind !== undefined && !data.entityType) {
      ctx.addIssue({
        code: "custom",
        path: ["entityType"],
        params: { error: CustomErrorCode.automationEntityTypeRequired },
      });
    }
  });

export type UpsertAutomationData = Data<typeof UpsertAutomationSchema>;

export abstract class UpsertAutomationRepo {
  abstract upsertAutomationOrThrow(args: UpsertAutomationData, createdByUserId: string): Promise<AutomationDto>;
  abstract getAutomationById(id: string): Promise<AutomationDto | null>;
}

@TenantInteractor({ resource: Resource.automations, action: Action.update })
export class UpsertAutomationInteractor extends AuthenticatedInteractor<UpsertAutomationData, AutomationDto> {
  constructor(
    private repo: UpsertAutomationRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Write({
    input: UpsertAutomationSchema,
    output: AutomationDtoSchema,
    precheck: (self, data, ctx) => self.precheck(data, ctx),
  })
  async invoke(data: UpsertAutomationData): Validated<AutomationDto> {
    const existed = data.id !== undefined;
    const automation = await this.repo.upsertAutomationOrThrow(data, this.userId);

    await this.eventService.publish(existed ? DomainEvent.AUTOMATION_UPDATED : DomainEvent.AUTOMATION_CREATED, {
      entityId: automation.id,
      payload: { id: automation.id, name: automation.name, enabled: automation.enabled },
    });

    return { ok: true as const, data: automation };
  }

  private async precheck(data: UpsertAutomationData, ctx: zType.RefinementCtx) {
    const existing = data.id ? await this.repo.getAutomationById(data.id) : null;

    if (data.id && !existing) {
      ctx.addIssue({ code: "custom", path: ["id"], params: { error: CustomErrorCode.automationNotFound } });
      return;
    }

    const entityType = data.entityType === undefined ? (existing?.entityType ?? null) : data.entityType;
    const steps = data.steps ?? [];

    assertActionsFitEntity(steps, entityType, ctx);
  }
}
