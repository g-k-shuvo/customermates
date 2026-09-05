import type { UserService } from "@/features/user/user.service";

import { Action, EntityType, Resource } from "@/generated/prisma";

export const IMPORT_READ_RESOURCE: Record<EntityType, Resource> = {
  [EntityType.contact]: Resource.contacts,
  [EntityType.organization]: Resource.organizations,
  [EntityType.deal]: Resource.deals,
  [EntityType.service]: Resource.services,
  [EntityType.task]: Resource.tasks,
};

export async function assertImportReadable(userService: UserService, entityType: EntityType): Promise<void> {
  const resource = IMPORT_READ_RESOURCE[entityType];

  if (await userService.hasPermission(resource, Action.readAll)) return;

  await userService.hasPermissionOrThrow(resource, Action.readOwn);
}
