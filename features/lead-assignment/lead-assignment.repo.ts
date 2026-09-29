import type { LeadAssignmentRuleDto } from "./lead-assignment.schema";
import type { Filter } from "@/core/base/base-get.schema";
import type { LeadAssignmentStrategy } from "@/generated/prisma";

export type LeadAssignmentRuleFields = {
  name: string;
  position: number;
  enabled: boolean;
  conditions: Filter[];
  strategy: LeadAssignmentStrategy;
  userIds: string[];
};

export abstract class LeadAssignmentRepo {
  abstract findRulesCompanyWide(): Promise<LeadAssignmentRuleDto[]>;
  abstract findRuleOrNull(id: string): Promise<LeadAssignmentRuleDto | null>;
  abstract createRule(fields: LeadAssignmentRuleFields): Promise<LeadAssignmentRuleDto>;
  abstract updateRule(id: string, fields: LeadAssignmentRuleFields): Promise<void>;
  abstract deleteRule(id: string): Promise<void>;
  abstract findActiveUserIds(userIds: readonly string[]): Promise<string[]>;
  abstract recordAssignment(ruleId: string, previous: string | null, userId: string): Promise<boolean>;
  abstract assignLeadIfUnowned(leadId: string, userId: string): Promise<boolean>;
}
