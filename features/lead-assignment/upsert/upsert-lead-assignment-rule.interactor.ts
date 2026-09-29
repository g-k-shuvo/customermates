import type { LeadAssignmentRepo, LeadAssignmentRuleFields } from "../lead-assignment.repo";
import type { Filter } from "@/core/base/base-get.schema";
import type { Validated } from "@/core/validation/validation.utils";

import {
  type CreateLeadAssignmentRuleData,
  CreateLeadAssignmentRuleSchema,
  LEAD_ASSIGNMENT_WRITE,
  type LeadAssignmentRuleDto,
  LeadAssignmentRuleDtoSchema,
  type LeadAssignmentRuleIdData,
  LeadAssignmentRuleIdSchema,
  type UpdateLeadAssignmentRuleData,
  UpdateLeadAssignmentRuleSchema,
} from "../lead-assignment.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { failConflict, failNotFound } from "@/core/validation/interactor-failure-server";

export type LeadConditionValidator = { invalidLeadConditions(conditions: Filter[]): Promise<boolean> };

async function fieldsOrFailure(
  data: CreateLeadAssignmentRuleData,
  repo: LeadAssignmentRepo,
  validator: LeadConditionValidator,
) {
  const userIds = [...new Set(data.userIds)];
  if ((await repo.findActiveUserIds(userIds)).length !== userIds.length)
    return failConflict(CustomErrorCode.leadAssignmentUserUnavailable, ["userIds"]);

  const conditions = (data.conditions ?? []) as Filter[];
  if (await validator.invalidLeadConditions(conditions))
    return failConflict(CustomErrorCode.leadAssignmentConditionInvalid, ["conditions"]);

  const fields: LeadAssignmentRuleFields = {
    name: data.name,
    position: data.position ?? 0,
    enabled: data.enabled ?? true,
    conditions,
    strategy: data.strategy,
    userIds,
  };

  return fields;
}

@TenantInteractor(LEAD_ASSIGNMENT_WRITE)
export class CreateLeadAssignmentRuleInteractor extends AuthenticatedInteractor<
  CreateLeadAssignmentRuleData,
  LeadAssignmentRuleDto
> {
  constructor(
    private repo: LeadAssignmentRepo,
    private validator: LeadConditionValidator,
  ) {
    super();
  }

  @Write({ input: CreateLeadAssignmentRuleSchema, output: LeadAssignmentRuleDtoSchema })
  async invoke(data: CreateLeadAssignmentRuleData): Validated<LeadAssignmentRuleDto> {
    const fields = await fieldsOrFailure(data, this.repo, this.validator);
    if ("ok" in fields) return fields;

    return { ok: true as const, data: await this.repo.createRule(fields) };
  }
}

@TenantInteractor(LEAD_ASSIGNMENT_WRITE)
export class UpdateLeadAssignmentRuleInteractor extends AuthenticatedInteractor<
  UpdateLeadAssignmentRuleData,
  LeadAssignmentRuleDto
> {
  constructor(
    private repo: LeadAssignmentRepo,
    private validator: LeadConditionValidator,
  ) {
    super();
  }

  @Write({ input: UpdateLeadAssignmentRuleSchema, output: LeadAssignmentRuleDtoSchema })
  async invoke(data: UpdateLeadAssignmentRuleData): Validated<LeadAssignmentRuleDto> {
    if (!(await this.repo.findRuleOrNull(data.id)))
      return failNotFound(CustomErrorCode.leadAssignmentRuleNotFound, ["id"]);

    const fields = await fieldsOrFailure(data, this.repo, this.validator);
    if ("ok" in fields) return fields;

    await this.repo.updateRule(data.id, fields);
    const rule = await this.repo.findRuleOrNull(data.id);
    if (!rule) return failNotFound(CustomErrorCode.leadAssignmentRuleNotFound, ["id"]);

    return { ok: true as const, data: rule };
  }
}

@TenantInteractor(LEAD_ASSIGNMENT_WRITE)
export class DeleteLeadAssignmentRuleInteractor extends AuthenticatedInteractor<
  LeadAssignmentRuleIdData,
  LeadAssignmentRuleDto
> {
  constructor(private repo: LeadAssignmentRepo) {
    super();
  }

  @Write({ input: LeadAssignmentRuleIdSchema, output: LeadAssignmentRuleDtoSchema })
  async invoke(data: LeadAssignmentRuleIdData): Validated<LeadAssignmentRuleDto> {
    const rule = await this.repo.findRuleOrNull(data.id);
    if (!rule) return failNotFound(CustomErrorCode.leadAssignmentRuleNotFound, ["id"]);

    await this.repo.deleteRule(data.id);

    return { ok: true as const, data: rule };
  }
}
