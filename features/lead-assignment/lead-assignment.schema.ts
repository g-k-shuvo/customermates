import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { Action, LeadAssignmentStrategy, Resource } from "@/generated/prisma";

import { FilterSchema } from "@/core/base/base-get.schema";
import { CustomErrorCode } from "@/core/validation/validation.types";

export const LEAD_ASSIGNMENT_READ = { resource: Resource.company, action: Action.readAll };
export const LEAD_ASSIGNMENT_WRITE = { resource: Resource.company, action: Action.update };

export const LeadAssignmentRuleDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  position: z.number().int(),
  enabled: z.boolean(),
  conditions: z.array(FilterSchema),
  strategy: z.enum(LeadAssignmentStrategy),
  userIds: z.array(z.uuid()),
  lastAssignedUserId: z.uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type LeadAssignmentRuleDto = Data<typeof LeadAssignmentRuleDtoSchema>;

const RuleFields = z.object({
  name: z.string().trim().min(1).max(120),
  position: z.number().int().min(0).max(1000).default(0),
  enabled: z.boolean().default(true),
  conditions: z.array(FilterSchema).max(20).default([]),
  strategy: z.enum(LeadAssignmentStrategy),
  userIds: z.array(z.uuid()).min(1).max(50),
});

export const CreateLeadAssignmentRuleSchema = RuleFields.superRefine((data, ctx) => {
  if (data.strategy === LeadAssignmentStrategy.specificUser && data.userIds.length !== 1)
    ctx.addIssue({ code: "custom", path: ["userIds"], params: { error: CustomErrorCode.leadAssignmentOneUser } });
});
export type CreateLeadAssignmentRuleData = z.input<typeof CreateLeadAssignmentRuleSchema>;

export const UpdateLeadAssignmentRuleSchema = RuleFields.extend({ id: z.uuid() }).superRefine((data, ctx) => {
  if (data.strategy === LeadAssignmentStrategy.specificUser && data.userIds.length !== 1)
    ctx.addIssue({ code: "custom", path: ["userIds"], params: { error: CustomErrorCode.leadAssignmentOneUser } });
});
export type UpdateLeadAssignmentRuleData = z.input<typeof UpdateLeadAssignmentRuleSchema>;

export const LeadAssignmentRuleBodySchema = RuleFields;

export const LeadAssignmentRuleIdSchema = z.object({ id: z.uuid() });
export type LeadAssignmentRuleIdData = Data<typeof LeadAssignmentRuleIdSchema>;
