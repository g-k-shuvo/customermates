import type { DuplicateEntityType } from "./duplicate.schema";

import { Action, EntityType, Resource } from "@/generated/prisma";

export const DUPLICATE_RESOURCE: Record<DuplicateEntityType, Resource> = {
  [EntityType.contact]: Resource.contacts,
  [EntityType.organization]: Resource.organizations,
};

export const DUPLICATE_ANY_REVIEW_PERMISSIONS = {
  permissions: [
    { resource: Resource.contacts, action: Action.readAll },
    { resource: Resource.organizations, action: Action.readAll },
  ],
  condition: "OR" as const,
};

export type DuplicatePermissionChecker = {
  hasPermissionOrThrow(resource: Resource, action: Action): Promise<void>;
};

export async function assertDuplicateAccess(
  users: DuplicatePermissionChecker,
  entityType: DuplicateEntityType,
  actions: readonly Action[],
) {
  for (const action of actions) await users.hasPermissionOrThrow(DUPLICATE_RESOURCE[entityType], action);
}
