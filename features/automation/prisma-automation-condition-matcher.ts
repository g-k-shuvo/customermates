import type { AutomationConditionMatcher } from "./automation-condition-matcher";
import type { Filter } from "@/core/base/base-get.schema";

import type { Prisma } from "@/generated/prisma";
import { EntityType } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";

const DELEGATE_BY_ENTITY_TYPE: Record<EntityType, string> = {
  [EntityType.contact]: "contact",
  [EntityType.organization]: "organization",
  [EntityType.deal]: "deal",
  [EntityType.service]: "service",
  [EntityType.task]: "task",
  [EntityType.lead]: "lead",
};

export class PrismaAutomationConditionMatcher extends BaseRepository implements AutomationConditionMatcher {
  @BypassTenantGuard
  async matchesUnscoped(args: {
    companyId: string;
    entityType: EntityType;
    entityId: string;
    conditions: Filter[];
  }): Promise<boolean> {
    if (args.conditions.length === 0) return true;

    const model = DELEGATE_BY_ENTITY_TYPE[args.entityType];
    const { where } = await this.buildQueryArgs({ filters: args.conditions }, {
      companyId: args.companyId,
    } as Prisma.ContactWhereInput);

    const delegate = (this.prisma as unknown as Record<string, { count: (args: unknown) => Promise<number> }>)[model];
    if (!delegate) return false;

    const matches = await delegate.count({ where: { ...where, id: args.entityId } });

    return matches > 0;
  }
}
