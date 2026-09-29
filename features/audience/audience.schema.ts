import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { Action, Resource } from "@/generated/prisma";

export const AUDIENCE_READ = {
  permissions: [
    { resource: Resource.contacts, action: Action.readAll },
    { resource: Resource.contacts, action: Action.readOwn },
  ],
  condition: "OR" as const,
};

export const AUDIENCE_PREVIEW_LIMIT = 25;

const FieldValues = z.array(z.string().trim().min(1).max(500)).min(1).max(50);

export const AudiencePredicateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("onList"), listId: z.uuid() }),
  z.object({ kind: z.literal("notOnList"), listId: z.uuid() }),
  z.object({ kind: z.literal("contactField"), columnId: z.uuid(), values: FieldValues }),
  z.object({ kind: z.literal("organizationField"), columnId: z.uuid(), values: FieldValues }),
]);
export type AudiencePredicate = Data<typeof AudiencePredicateSchema>;

export const AUDIENCE_GROUP_KINDS = ["anyOf", "noneOf"] as const;

const GroupConditions = z.array(AudiencePredicateSchema).min(1).max(10);

export const AudienceConditionSchema = z.discriminatedUnion("kind", [
  ...AudiencePredicateSchema.options,
  z.object({ kind: z.literal("anyOf"), conditions: GroupConditions }),
  z.object({ kind: z.literal("noneOf"), conditions: GroupConditions }),
]);
export type AudienceCondition = Data<typeof AudienceConditionSchema>;

export const AudienceDefinitionSchema = z.object({
  conditions: z.array(AudienceConditionSchema).min(1).max(10),
});
export type AudienceDefinition = Data<typeof AudienceDefinitionSchema>;

export function audiencePredicates(definition: AudienceDefinition): AudiencePredicate[] {
  return definition.conditions.flatMap((condition) =>
    condition.kind === "anyOf" || condition.kind === "noneOf" ? condition.conditions : [condition],
  );
}

export const AudienceRecipientSchema = z.object({
  contactId: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  organizationName: z.string().nullable(),
});
export type AudienceRecipient = Data<typeof AudienceRecipientSchema>;

export const AudiencePreviewDtoSchema = z.object({
  count: z.number().int(),
  withoutEmail: z.number().int(),
  sample: z.array(AudienceRecipientSchema).max(AUDIENCE_PREVIEW_LIMIT),
});
export type AudiencePreviewDto = Data<typeof AudiencePreviewDtoSchema>;
