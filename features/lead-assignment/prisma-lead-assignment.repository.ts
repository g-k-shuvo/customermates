import type { LeadAssignmentRepo, LeadAssignmentRuleFields } from "./lead-assignment.repo";
import type { LeadAssignmentRuleDto } from "./lead-assignment.schema";
import type { Filter } from "@/core/base/base-get.schema";

import { type Prisma, Status } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";

const RULE_SELECT = {
  id: true,
  name: true,
  position: true,
  enabled: true,
  conditions: true,
  strategy: true,
  userIds: true,
  lastAssignedUserId: true,
  createdAt: true,
  updatedAt: true,
} as const;

type RuleRow = Prisma.LeadAssignmentRuleGetPayload<{ select: typeof RULE_SELECT }>;

const toDto = (row: RuleRow): LeadAssignmentRuleDto => ({
  ...row,
  conditions: Array.isArray(row.conditions) ? (row.conditions as unknown as Filter[]) : [],
});

const data = (fields: LeadAssignmentRuleFields) => ({
  ...fields,
  conditions: fields.conditions as unknown as Prisma.InputJsonValue,
});

export class PrismaLeadAssignmentRepo extends BaseRepository implements LeadAssignmentRepo {
  async findRulesCompanyWide(): Promise<LeadAssignmentRuleDto[]> {
    const rows = await this.prisma.leadAssignmentRule.findMany({
      where: { companyId: this.companyId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: RULE_SELECT,
    });

    return rows.map(toDto);
  }

  async findRuleOrNull(id: string): Promise<LeadAssignmentRuleDto | null> {
    const row = await this.prisma.leadAssignmentRule.findFirst({
      where: { id, companyId: this.companyId },
      select: RULE_SELECT,
    });

    return row ? toDto(row) : null;
  }

  async createRule(fields: LeadAssignmentRuleFields): Promise<LeadAssignmentRuleDto> {
    return toDto(
      await this.prisma.leadAssignmentRule.create({
        data: { companyId: this.companyId, ...data(fields) },
        select: RULE_SELECT,
      }),
    );
  }

  async updateRule(id: string, fields: LeadAssignmentRuleFields): Promise<void> {
    await this.prisma.leadAssignmentRule.updateMany({ where: { id, companyId: this.companyId }, data: data(fields) });
  }

  async deleteRule(id: string): Promise<void> {
    await this.prisma.leadAssignmentRule.deleteMany({ where: { id, companyId: this.companyId } });
  }

  async findActiveUserIds(userIds: readonly string[]): Promise<string[]> {
    const rows = await this.prisma.user.findMany({
      where: { companyId: this.companyId, id: { in: [...userIds] }, status: Status.active },
      select: { id: true },
    });

    return rows.map((row) => row.id);
  }

  async recordAssignment(ruleId: string, previous: string | null, userId: string): Promise<boolean> {
    const { count } = await this.prisma.leadAssignmentRule.updateMany({
      where: { id: ruleId, companyId: this.companyId, lastAssignedUserId: previous },
      data: { lastAssignedUserId: userId },
    });

    return count === 1;
  }

  async assignLeadIfUnowned(leadId: string, userId: string): Promise<boolean> {
    const { count } = await this.prisma.lead.updateMany({
      where: { id: leadId, companyId: this.companyId, ownerUserId: null },
      data: { ownerUserId: userId },
    });

    return count === 1;
  }
}
