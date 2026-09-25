import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { AutomationActionKind, AutomationRunStatus, AutomationTriggerKind, EntityType } from "@/generated/prisma";
import { FilterSchema } from "@/core/base/base-get.schema";

export const AUTOMATION_NAME_MAX_LENGTH = 120;
export const AUTOMATION_DESCRIPTION_MAX_LENGTH = 500;
export const AUTOMATION_MAX_STEPS = 20;
export const AUTOMATION_MAX_CHANGED_FIELDS = 20;

export const AUTOMATION_TRIGGER_ENTITY_TYPES = [
  EntityType.contact,
  EntityType.organization,
  EntityType.deal,
  EntityType.lead,
  EntityType.task,
] as const;

export const AutomationTriggerEntityTypeSchema = z.enum(AUTOMATION_TRIGGER_ENTITY_TYPES);
export type AutomationTriggerEntityType = (typeof AUTOMATION_TRIGGER_ENTITY_TYPES)[number];

export const AutomationStepDtoSchema = z.object({
  id: z.uuid(),
  position: z.number().int().min(0),
  kind: z.enum(AutomationActionKind),
  config: z.unknown(),
});

export const AutomationDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  enabled: z.boolean(),
  entityType: z.enum(EntityType).nullable(),
  triggerKind: z.enum(AutomationTriggerKind),
  changedFields: z.array(z.string()),
  conditions: z.array(FilterSchema).nullable(),
  schedule: z.string().nullable(),
  scheduleTimeZone: z.string().nullable(),
  nextRunAt: z.date().nullable(),
  lastRunAt: z.date().nullable(),
  steps: z.array(AutomationStepDtoSchema),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type AutomationDto = Data<typeof AutomationDtoSchema>;

export const AutomationRunStepDtoSchema = z.object({
  id: z.uuid(),
  position: z.number().int().min(0),
  kind: z.enum(AutomationActionKind).nullable(),
  status: z.enum(AutomationRunStatus),
  output: z.unknown().nullable(),
  error: z.string().nullable(),
  startedAt: z.date().nullable(),
  finishedAt: z.date().nullable(),
});

export const AutomationRunDtoSchema = z.object({
  id: z.uuid(),
  automationId: z.uuid(),
  automationName: z.string().nullable(),
  status: z.enum(AutomationRunStatus),
  entityType: z.enum(EntityType).nullable(),
  entityId: z.uuid().nullable(),
  triggerEvent: z.string().nullable(),
  startedAt: z.date().nullable(),
  finishedAt: z.date().nullable(),
  error: z.string().nullable(),
  steps: z.array(AutomationRunStepDtoSchema),
  createdAt: z.date(),
});

export type AutomationRunDto = Data<typeof AutomationRunDtoSchema>;
