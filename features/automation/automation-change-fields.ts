import type { ZodObject } from "zod";

import { EntityType } from "@/generated/prisma";

import { ContactDtoSchema } from "@/features/contacts/contact.schema";
import { DealDtoSchema } from "@/features/deals/deal.schema";
import { LeadDtoSchema } from "@/features/leads/lead.schema";
import { OrganizationDtoSchema } from "@/features/organizations/organization.schema";
import { ServiceDtoSchema } from "@/features/services/service.schema";
import { TaskDtoSchema } from "@/features/tasks/task.schema";

const DERIVED_FIELDS = new Set([
  "id",
  "createdAt",
  "updatedAt",
  "avatarUrl",
  "customFieldValues",
  "weightedValue",
  "isRotting",
  "lostReasonName",
  "stageEnteredAt",
]);

const SCHEMA_BY_ENTITY_TYPE: Record<EntityType, ZodObject> = {
  [EntityType.contact]: ContactDtoSchema,
  [EntityType.organization]: OrganizationDtoSchema,
  [EntityType.deal]: DealDtoSchema,
  [EntityType.service]: ServiceDtoSchema,
  [EntityType.task]: TaskDtoSchema,
  [EntityType.lead]: LeadDtoSchema,
};

export function automationChangeFields(entityType: EntityType | null): string[] {
  if (!entityType) return [];

  return Object.keys(SCHEMA_BY_ENTITY_TYPE[entityType].shape).filter((field) => !DERIVED_FIELDS.has(field));
}
