import type { AutomationActionExecutor } from "./automation-action-executor";
import type { ExecuteAutomationRunRepo } from "./execute-automation-run.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";

import z from "zod";
import { AutomationRunStatus } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { fail } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { runInAutomationContext } from "@/core/decorators/automation-context";

export const ExecuteAutomationStepSchema = z.object({
  automationRunId: z.uuid(),
  runStepId: z.uuid(),
});
export type ExecuteAutomationStepData = Data<typeof ExecuteAutomationStepSchema>;

@SystemInteractor
export class ExecuteAutomationStepInteractor {
  constructor(
    private repo: ExecuteAutomationRunRepo,
    private executor: AutomationActionExecutor,
  ) {}

  @Validate(ExecuteAutomationStepSchema)
  async invoke(data: ExecuteAutomationStepData): Validated<null> {
    const plan = await this.repo.findRunPlanUnscoped(data.automationRunId);
    const step = plan?.steps.find((candidate) => candidate.id === data.runStepId);

    if (!plan || !step) return fail(CustomErrorCode.automationNotFound);

    const startedAt = new Date();
    await this.repo.markRunStepUnscoped({ runStepId: step.id, status: AutomationRunStatus.running, startedAt });

    const outcome = await runInAutomationContext(
      { automationId: plan.automationId, runId: plan.runId, causationDepth: 1 },
      () =>
        this.executor.execute({
          kind: step.kind,
          config: step.config,
          context: { run: plan, entityType: plan.entityType, entityId: plan.entityId },
        }),
    );

    await this.repo.markRunStepUnscoped({
      runStepId: step.id,
      status: outcome.ok ? AutomationRunStatus.succeeded : AutomationRunStatus.failed,
      output: outcome.ok ? outcome.output : undefined,
      error: outcome.ok ? null : outcome.error,
      finishedAt: new Date(),
    });

    if (!outcome.ok) return fail(CustomErrorCode.automationStepFailed);

    return { ok: true as const, data: null };
  }
}
