import type {
  AutomationActionContext,
  AutomationActionExecutor,
  AutomationActionOutcome,
} from "./automation-action-executor";
import type { ExecuteAutomationRunRepo } from "./execute-automation-run.repo";
import type { AutomationStepError } from "../automation-step-errors";
import type { Data, Validated } from "@/core/validation/validation.utils";

import z from "zod";
import { AutomationRunStatus } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { fail } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { runInAutomationContext } from "@/core/decorators/automation-context";
import { AppErrorCode, appErrorDetailsInCauseChain } from "@/core/errors/app-errors";
import { prismaClientError } from "@/core/errors/prisma-client-error";

export const ExecuteAutomationStepSchema = z.object({
  automationRunId: z.uuid(),
  runStepId: z.uuid(),
});
export type ExecuteAutomationStepData = Data<typeof ExecuteAutomationStepSchema>;

export type BegunAutomationStep = {
  claimed: true;
  automationId: string;
  runId: string;
  runStepId: string;
  kind: string;
  config: unknown;
  context: AutomationActionContext;
};

export type HandledAutomationStep = { claimed: false; succeeded: boolean };

export type AutomationStepFailure = { outcome: AutomationActionOutcome; unexpected: boolean };

const INTERRUPTED: AutomationStepError = "interrupted";

@SystemInteractor
export class ExecuteAutomationStepInteractor {
  constructor(
    private repo: ExecuteAutomationRunRepo,
    private executor: AutomationActionExecutor,
  ) {}

  @Validate(ExecuteAutomationStepSchema)
  async invoke(data: ExecuteAutomationStepData): Validated<BegunAutomationStep | HandledAutomationStep> {
    const plan = await this.repo.findRunPlanUnscoped(data.automationRunId);
    const step = plan?.steps.find((candidate) => candidate.id === data.runStepId);

    if (!plan || !step) return fail(CustomErrorCode.automationNotFound);

    const startedAt = new Date();
    const claimed = await this.repo.claimRunStepUnscoped({ runStepId: step.id, startedAt });

    if (!claimed) {
      const status = await this.repo.findRunStepStatusUnscoped(step.id);

      if (status === AutomationRunStatus.running)
        await this.repo.failRunningRunStepUnscoped({ runStepId: step.id, error: INTERRUPTED, finishedAt: new Date() });

      return { ok: true as const, data: { claimed: false, succeeded: status === AutomationRunStatus.succeeded } };
    }

    return {
      ok: true as const,
      data: {
        claimed: true,
        automationId: plan.automationId,
        runId: plan.runId,
        runStepId: step.id,
        kind: step.kind,
        config: step.config,
        context: { run: plan, entityType: plan.entityType, entityId: plan.entityId },
      },
    };
  }

  async perform(begun: BegunAutomationStep): Promise<AutomationActionOutcome> {
    return runInAutomationContext({ automationId: begun.automationId, runId: begun.runId, causationDepth: 1 }, () =>
      this.executor.execute({ kind: begun.kind, config: begun.config, context: begun.context }),
    );
  }

  failureFor(error: unknown): AutomationStepFailure {
    const code = stepErrorFor(error);

    return { outcome: { ok: false, error: code }, unexpected: code === "unexpectedError" };
  }

  async finish(begun: BegunAutomationStep, outcome: AutomationActionOutcome): Validated<null> {
    await this.repo.markRunStepUnscoped({
      runStepId: begun.runStepId,
      status: outcome.ok ? AutomationRunStatus.succeeded : AutomationRunStatus.failed,
      output: outcome.ok ? outcome.output : undefined,
      error: outcome.ok ? null : outcome.error,
      finishedAt: new Date(),
    });

    if (!outcome.ok) return fail(CustomErrorCode.automationStepFailed);

    return { ok: true as const, data: null };
  }
}

function stepErrorFor(error: unknown): AutomationStepError {
  const code = appErrorDetailsInCauseChain(error)?.code;

  if (code === AppErrorCode.inactiveUser) return "ownerInactive";
  if (code === AppErrorCode.permissionDenied) return "ownerNotPermitted";
  if (prismaClientError(error)?.status === 404) return "recordMissing";

  return "unexpectedError";
}
