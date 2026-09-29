import type { LeadAssignmentRepo } from "../lead-assignment.repo";
import type { Validated } from "@/core/validation/validation.utils";

import {
  LEAD_ASSIGNMENT_READ,
  type LeadAssignmentRuleDto,
  LeadAssignmentRuleDtoSchema,
} from "../lead-assignment.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

@AllowInDemoMode
@TenantInteractor(LEAD_ASSIGNMENT_READ)
export class GetLeadAssignmentRulesInteractor extends AuthenticatedInteractor<void, LeadAssignmentRuleDto[]> {
  constructor(private repo: LeadAssignmentRepo) {
    super();
  }

  @ValidateOutput(LeadAssignmentRuleDtoSchema)
  async invoke(): Validated<LeadAssignmentRuleDto[]> {
    return { ok: true as const, data: await this.repo.findRulesCompanyWide() };
  }
}
