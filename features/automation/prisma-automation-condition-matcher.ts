import type { AutomationConditionMatcher } from "./automation-condition-matcher";
import type { Filter, FilterableField } from "@/core/base/base-get.schema";

import { EntityType } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { getContactRepo, getDealRepo, getLeadRepo, getOrganizationRepo, getServiceRepo, getTaskRepo } from "@/core/di";

type FilterCapableRepo = {
  getFilterableFields: () => Promise<FilterableField[]>;
  validateFilters: (args: { filters: Filter[] | undefined; filterableFields: FilterableField[] }) => Filter[];
  buildQueryArgs: (params: { filters: Filter[] }, baseWhere?: never) => Promise<{ where: Record<string, unknown> }>;
};

const DELEGATE_BY_ENTITY_TYPE: Record<EntityType, string> = {
  [EntityType.contact]: "contact",
  [EntityType.organization]: "organization",
  [EntityType.deal]: "deal",
  [EntityType.service]: "service",
  [EntityType.task]: "task",
  [EntityType.lead]: "lead",
};

function repoFor(entityType: EntityType): FilterCapableRepo | null {
  switch (entityType) {
    case EntityType.contact:
      return getContactRepo() as unknown as FilterCapableRepo;
    case EntityType.organization:
      return getOrganizationRepo() as unknown as FilterCapableRepo;
    case EntityType.deal:
      return getDealRepo() as unknown as FilterCapableRepo;
    case EntityType.lead:
      return getLeadRepo() as unknown as FilterCapableRepo;
    case EntityType.task:
      return getTaskRepo() as unknown as FilterCapableRepo;
    case EntityType.service:
      return getServiceRepo() as unknown as FilterCapableRepo;
    default:
      return null;
  }
}

export class PrismaAutomationConditionMatcher extends BaseRepository implements AutomationConditionMatcher {
  async matchesInTenant(args: {
    companyId: string;
    entityType: EntityType;
    entityId: string;
    conditions: Filter[];
  }): Promise<boolean> {
    if (args.conditions.length === 0) return true;

    const repo = repoFor(args.entityType);
    if (!repo) return false;

    const filterableFields = await repo.getFilterableFields();
    const filters = repo.validateFilters({ filters: args.conditions, filterableFields });

    if (filters.length !== args.conditions.length) return false;

    const { where } = await repo.buildQueryArgs({ filters });
    const model = DELEGATE_BY_ENTITY_TYPE[args.entityType];
    const delegate = (this.prisma as unknown as Record<string, { count: (input: unknown) => Promise<number> }>)[model];
    if (!delegate) return false;

    const matches = await delegate.count({ where: { ...where, id: args.entityId, companyId: args.companyId } });

    return matches > 0;
  }
}
