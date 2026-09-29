import type { LeadAssignmentRepo } from "./lead-assignment.repo";
import type { LeadAssignmentRuleDto } from "./lead-assignment.schema";
import type { AutomationConditionMatcher } from "@/features/automation/automation-condition-matcher";

import { EntityType, LeadAssignmentStrategy } from "@/generated/prisma";

export type LeadAssignment = { ruleId: string; userId: string };

export type CompanyAdminLookup = { findAutomationOwnerUserIdUnscoped(companyId: string): Promise<string | null> };

const ROUND_ROBIN_ATTEMPTS = 3;

export class LeadAssigner {
  constructor(
    private repo: LeadAssignmentRepo,
    private matcher: AutomationConditionMatcher,
    private admins: CompanyAdminLookup,
  ) {}

  async assign(companyId: string, leadId: string): Promise<LeadAssignment | null> {
    const rules = (await this.repo.findRulesCompanyWide()).filter((rule) => rule.enabled);

    for (const rule of rules) {
      const matches = await this.matcher.matchesInTenant({
        companyId,
        entityType: EntityType.lead,
        entityId: leadId,
        conditions: rule.conditions,
      });
      if (!matches) continue;

      const userId = await this.pickUser(rule);
      if (!userId) continue;

      return (await this.repo.assignLeadIfUnowned(leadId, userId)) ? { ruleId: rule.id, userId } : null;
    }

    return null;
  }

  async companyActor(companyId: string): Promise<string | null> {
    return await this.admins.findAutomationOwnerUserIdUnscoped(companyId);
  }

  private async pickUser(rule: LeadAssignmentRuleDto): Promise<string | null> {
    const active = new Set(await this.repo.findActiveUserIds(rule.userIds));
    const candidates = rule.userIds.filter((id) => active.has(id));
    if (candidates.length === 0) return null;
    if (rule.strategy === LeadAssignmentStrategy.specificUser) return candidates[0];

    let previous = rule.lastAssignedUserId;
    for (let attempt = 0; attempt < ROUND_ROBIN_ATTEMPTS; attempt += 1) {
      const after = previous ? candidates.indexOf(previous) : -1;
      const next = candidates[(after + 1) % candidates.length];
      if (await this.repo.recordAssignment(rule.id, previous, next)) return next;

      previous = (await this.repo.findRuleOrNull(rule.id))?.lastAssignedUserId ?? null;
    }

    return candidates[0];
  }
}
