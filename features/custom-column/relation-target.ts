import { EntityType } from "@/generated/prisma";

export const RELATION_TARGET_ENTITY_TYPES = [EntityType.contact, EntityType.organization, EntityType.deal] as const;

export type RelationTargetEntityType = (typeof RELATION_TARGET_ENTITY_TYPES)[number];

export const RELATION_TARGET_ID_FIELD = {
  [EntityType.contact]: "targetContactId",
  [EntityType.organization]: "targetOrganizationId",
  [EntityType.deal]: "targetDealId",
} as const satisfies Record<RelationTargetEntityType, string>;
