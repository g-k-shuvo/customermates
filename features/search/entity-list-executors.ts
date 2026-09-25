import type { GetQueryParamsApi } from "@/core/base/base-get.schema";
import type { EntityType } from "@/generated/prisma";

import {
  getGetContactsApiInteractor,
  getGetDealsApiInteractor,
  getGetOrganizationsApiInteractor,
  getGetServicesApiInteractor,
  getGetTasksApiInteractor,
} from "@/core/di";

export const entityListExecutors: Partial<
  Record<EntityType, (params: GetQueryParamsApi) => Promise<{ ok: boolean; data?: any; error?: any }>>
> = {
  contact: async (params) => getGetContactsApiInteractor().invoke(params),
  organization: async (params) => getGetOrganizationsApiInteractor().invoke(params),
  deal: async (params) => getGetDealsApiInteractor().invoke(params),
  service: async (params) => getGetServicesApiInteractor().invoke(params),
  task: async (params) => getGetTasksApiInteractor().invoke(params),
};

export const entityNameExtractors: Partial<Record<EntityType, (item: any) => string>> = {
  contact: (item) => `${item.firstName ?? ""} ${item.lastName ?? ""}`.trim(),
  organization: (item) => String(item.name ?? ""),
  deal: (item) => String(item.name ?? ""),
  service: (item) => String(item.name ?? ""),
  task: (item) => {
    const name = String(item.name ?? "").trim();
    return name || String(item.type ?? "");
  },
};

export const LISTABLE_ENTITY_TYPES = Object.keys(entityListExecutors) as EntityType[];

export function isListableEntityType(entityType: EntityType): boolean {
  return entityListExecutors[entityType] !== undefined;
}

export function requireEntityListExecutor(entityType: EntityType) {
  const executor = entityListExecutors[entityType];
  if (!executor) throw new Error(`No list executor is registered for ${entityType}`);

  return executor;
}

export function extractEntityName(entityType: EntityType, item: any): string {
  return entityNameExtractors[entityType]?.(item) ?? String(item?.name ?? "");
}
