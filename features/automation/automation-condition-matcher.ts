import type { Filter } from "@/core/base/base-get.schema";
import type { EntityType } from "@/generated/prisma";

export abstract class AutomationConditionMatcher {
  abstract matchesUnscoped(args: {
    companyId: string;
    entityType: EntityType;
    entityId: string;
    conditions: Filter[];
  }): Promise<boolean>;
}
