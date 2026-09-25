import type { ExecuteAutomationRunRepo } from "./execute-automation-run.repo";
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

export type PreparedAutomationRun = {
  ownerUserId: string | null;
  steps: Array<{ runStepId: string; kind: AutomationActionKind; delaySeconds: number | null }>;
};

@SystemInteractor
export class PrepareAutomationRunInteractor {
  constructor(private repo: ExecuteAutomationRunRepo) {}

  @Validate(PrepareAutomationRunSchema)
  async invoke(data: PrepareAutomationRunData): Validated<PreparedAutomationRun> {
    const plan = await this.repo.findRunPlanUnscoped(data.automationRunId);
    if (!plan) return { ok: true as const, data: { ownerUserId: null, steps: [] } };

    const claimed = await this.repo.claimRunUnscoped(data.automationRunId);
    if (!claimed) return { ok: true as const, data: { ownerUserId: null, steps: [] } };

    const ownerUserId = await this.repo.findAutomationOwnerUserIdUnscoped(plan.companyId);

    return {
      ok: true as const,
      data: {
        ownerUserId,
        steps: plan.steps.map((step) => ({
          runStepId: step.id,
          kind: step.kind,
          delaySeconds: step.kind === AutomationActionKind.delay ? delaySecondsOf(step.config) : null,
        })),
      },
    };
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
