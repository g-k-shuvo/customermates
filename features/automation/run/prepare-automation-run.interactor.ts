import type { ExecuteAutomationRunRepo } from "./execute-automation-run.repo";
import type { AutomationConditionMatcher } from "../automation-condition-matcher";
import type { Filter } from "@/core/base/base-get.schema";
import type { EntityType } from "@/generated/prisma";
import type { Data, Validated } from "@/core/validation/validation.utils";

import z from "zod";
import { AutomationActionKind, AutomationRunStatus } from "@/generated/prisma";

import { DelayConfigSchema } from "../automation-action.schema";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";

export const PrepareAutomationRunSchema = z.object({
  automationRunId: z.uuid(),
  companyId: z.uuid(),
});
export type PrepareAutomationRunData = Data<typeof PrepareAutomationRunSchema>;

export type AutomationConditionCheck = {
  companyId: string;
  entityType: EntityType;
  entityId: string;
  conditions: Filter[];
};

export type PreparedAutomationRun = {
  ownerUserId: string | null;
  steps: Array<{ runStepId: string; kind: AutomationActionKind; delaySeconds: number | null }>;
  conditionCheck: AutomationConditionCheck | null;
};

@SystemInteractor
export class PrepareAutomationRunInteractor {
  constructor(
    private repo: ExecuteAutomationRunRepo,
    private conditions: AutomationConditionMatcher,
  ) {}

  @Validate(PrepareAutomationRunSchema)
  async invoke(data: PrepareAutomationRunData): Validated<PreparedAutomationRun> {
    const plan = await this.repo.findRunPlanUnscoped(data.automationRunId);
    if (!plan) return { ok: true as const, data: { ownerUserId: null, steps: [], conditionCheck: null } };

    const claimed = await this.repo.claimRunUnscoped(data.automationRunId);
    if (!claimed) return { ok: true as const, data: { ownerUserId: null, steps: [], conditionCheck: null } };

    const ownerUserId = await this.repo.findAutomationOwnerUserIdUnscoped(plan.companyId);
    const conditionCheck =
      plan.entityType && plan.entityId && plan.conditions && plan.conditions.length > 0
        ? {
            companyId: plan.companyId,
            entityType: plan.entityType,
            entityId: plan.entityId,
            conditions: plan.conditions,
          }
        : null;

    return {
      ok: true as const,
      data: {
        ownerUserId,
        steps: plan.steps.map((step) => ({
          runStepId: step.id,
          kind: step.kind,
          delaySeconds: step.kind === AutomationActionKind.delay ? delaySecondsOf(step.config) : null,
        })),
        conditionCheck,
      },
    };
  }

  async matchesConditions(check: AutomationConditionCheck): Promise<boolean> {
    return this.conditions.matchesInTenant(check);
  }

  async skip(args: { automationRunId: string }): Promise<void> {
    await this.repo.settleRunUnscoped({
      runId: args.automationRunId,
      status: AutomationRunStatus.skipped,
      error: null,
    });
  }

  async completeWait(args: { runStepId: string }): Promise<void> {
    await this.repo.markRunStepUnscoped({
      runStepId: args.runStepId,
      status: AutomationRunStatus.succeeded,
      finishedAt: new Date(),
    });
  }

  async beginWait(args: { runStepId: string }): Promise<void> {
    await this.repo.markRunStepUnscoped({
      runStepId: args.runStepId,
      status: AutomationRunStatus.running,
      startedAt: new Date(),
    });
  }

  async settle(args: { automationRunId: string; companyId: string; failed: boolean }): Promise<void> {
    await this.repo.settleRunUnscoped({
      runId: args.automationRunId,
      status: args.failed ? AutomationRunStatus.failed : AutomationRunStatus.succeeded,
      error: null,
    });
  }
}

function delaySecondsOf(config: unknown): number | null {
  const parsed = DelayConfigSchema.safeParse(config);

  return parsed.success ? parsed.data.seconds : null;
}
