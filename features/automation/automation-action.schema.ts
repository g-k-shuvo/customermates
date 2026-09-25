import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { AutomationActionKind, EntityType, TaskType } from "@/generated/prisma";
import { zx } from "@/core/validation/validation.utils";

export const AUTOMATION_DELAY_MAX_SECONDS = 60 * 60 * 24 * 30;

const targetField = z.string().trim().min(1).max(100);

export const UpdateFieldConfigSchema = z.object({
  field: targetField,
  value: z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]),
});

export const AssignOwnerConfigSchema = z.object({
  userId: z.uuid().nullable(),
});

export const AddLabelConfigSchema = z.object({
  labels: z.array(z.string().trim().min(1).max(60)).min(1).max(20),
});

export const CreateTaskConfigSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.enum(TaskType).default(TaskType.custom),
  dueInDays: z.number().int().min(0).max(365).nullable().default(null),
  assigneeUserId: z.uuid().nullable().default(null),
  linkToTriggerRecord: z.boolean().default(true),
});

export const CreateNoteConfigSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});

export const CreateDealConfigSchema = z.object({
  name: z.string().trim().min(1).max(200),
  pipelineId: z.uuid().nullable().default(null),
  stageId: z.uuid().nullable().default(null),
  ownerUserId: z.uuid().nullable().default(null),
});

export const CreateLeadConfigSchema = z.object({
  title: z.string().trim().min(1).max(200),
  ownerUserId: z.uuid().nullable().default(null),
  labels: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
});

export const MoveStageConfigSchema = z.object({
  stageId: z.uuid(),
});

export const SendEmailConfigSchema = z.object({
  to: z.email().max(320),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
});

export const CallWebhookConfigSchema = z.object({
  url: zx.secureUrl(),
  includeRecord: z.boolean().default(true),
});

export const DelayConfigSchema = z.object({
  seconds: z.number().int().min(1).max(AUTOMATION_DELAY_MAX_SECONDS),
});

export const AutomationStepSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal(AutomationActionKind.updateField), config: UpdateFieldConfigSchema }),
  z.object({ kind: z.literal(AutomationActionKind.assignOwner), config: AssignOwnerConfigSchema }),
  z.object({ kind: z.literal(AutomationActionKind.addLabel), config: AddLabelConfigSchema }),
  z.object({ kind: z.literal(AutomationActionKind.createTask), config: CreateTaskConfigSchema }),
  z.object({ kind: z.literal(AutomationActionKind.createNote), config: CreateNoteConfigSchema }),
  z.object({ kind: z.literal(AutomationActionKind.createDeal), config: CreateDealConfigSchema }),
  z.object({ kind: z.literal(AutomationActionKind.createLead), config: CreateLeadConfigSchema }),
  z.object({ kind: z.literal(AutomationActionKind.moveStage), config: MoveStageConfigSchema }),
  z.object({ kind: z.literal(AutomationActionKind.sendEmail), config: SendEmailConfigSchema }),
  z.object({ kind: z.literal(AutomationActionKind.callWebhook), config: CallWebhookConfigSchema }),
  z.object({ kind: z.literal(AutomationActionKind.delay), config: DelayConfigSchema }),
]);

export type AutomationStepData = Data<typeof AutomationStepSchema>;

export const ENTITY_SCOPED_ACTIONS = [
  AutomationActionKind.updateField,
  AutomationActionKind.assignOwner,
  AutomationActionKind.addLabel,
  AutomationActionKind.createNote,
  AutomationActionKind.moveStage,
] as const;

export const DEAL_ONLY_ACTIONS = [AutomationActionKind.moveStage] as const;

export const ACTION_ENTITY_SUPPORT: Record<AutomationActionKind, readonly EntityType[] | null> = {
  [AutomationActionKind.updateField]: null,
  [AutomationActionKind.assignOwner]: null,
  [AutomationActionKind.addLabel]: [EntityType.lead],
  [AutomationActionKind.createNote]: null,
  [AutomationActionKind.moveStage]: [EntityType.deal],
  [AutomationActionKind.createTask]: null,
  [AutomationActionKind.createDeal]: null,
  [AutomationActionKind.createLead]: null,
  [AutomationActionKind.sendEmail]: null,
  [AutomationActionKind.callWebhook]: null,
  [AutomationActionKind.delay]: null,
};
