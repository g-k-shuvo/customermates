import { getWorkflowMetadata, sleep } from "workflow";

import { getExecuteAutomationStepInteractor, getPrepareAutomationRunInteractor } from "@/core/di";
import { isInteractorFailure } from "@/core/validation/validation.utils";
import { runAsBackgroundTenant } from "@/core/decorators/background-tenant";

import { reportFailure, toWorkflowFailure } from "./capture-failure";

const WORKFLOW_NAME = "run-automation";

export type RunAutomationPayload = {
  automationRunId: string;
  companyId: string;
};

type PreparedRun = {
  ownerUserId: string | null;
  steps: Array<{ runStepId: string; kind: string; delaySeconds: number | null }>;
};

function currentWorkflowRunId(): string | null {
  try {
    return getWorkflowMetadata().workflowRunId;
  } catch {
    return null;
  }
}

async function prepareRun(automationRunId: string, companyId: string): Promise<PreparedRun | null> {
  "use step";

  const prepare = getPrepareAutomationRunInteractor();
  const outcome = await prepare.invoke({
    automationRunId,
    companyId,
    claimToken: currentWorkflowRunId(),
  });
  if (isInteractorFailure(outcome)) return null;

  const { ownerUserId, steps, conditionCheck } = outcome.data;
  if (!ownerUserId || !conditionCheck) return { ownerUserId, steps };

  const matches = await runAsBackgroundTenant(ownerUserId, () => prepare.matchesConditions(conditionCheck));
  if (matches) return { ownerUserId, steps };

  await prepare.skip({ automationRunId });

  return { ownerUserId: null, steps: [] };
}
prepareRun.maxRetries = 3;

export async function executeStep(automationRunId: string, runStepId: string, ownerUserId: string): Promise<boolean> {
  "use step";

  const step = getExecuteAutomationStepInteractor();
  const begun = await step.invoke({ automationRunId, runStepId });
  if (isInteractorFailure(begun)) return false;
  if (!begun.data.claimed) return begun.data.succeeded;

  const claimed = begun.data;
  const outcome = await runAsBackgroundTenant(ownerUserId, () => step.perform(claimed)).catch(
    async (error: unknown) => {
      const failure = step.failureFor(error);

      if (failure.unexpected) {
        await reportFailure(WORKFLOW_NAME, toWorkflowFailure(error), {
          userId: ownerUserId,
          companyId: claimed.context.run.companyId,
        });
      }

      return failure.outcome;
    },
  );

  return !isInteractorFailure(await step.finish(claimed, outcome));
}
executeStep.maxRetries = 2;

async function settleRun(
  automationRunId: string,
  companyId: string,
  failed: boolean,
  ownerUserId: string,
): Promise<void> {
  "use step";

  await getPrepareAutomationRunInteractor().settle({ automationRunId, companyId, failed, ownerUserId });
}
settleRun.maxRetries = 3;

async function stillApplies(automationRunId: string, ownerUserId: string): Promise<boolean> {
  "use step";

  const prepare = getPrepareAutomationRunInteractor();
  const check = await prepare.recheckFor({ automationRunId });
  if (!check) return true;

  const applies = await runAsBackgroundTenant(ownerUserId, () => prepare.stillApplies(check));
  if (!applies) await prepare.cancel({ automationRunId });

  return applies;
}
stillApplies.maxRetries = 3;

async function beginWait(runStepId: string): Promise<void> {
  "use step";

  await getPrepareAutomationRunInteractor().beginWait({ runStepId });
}
beginWait.maxRetries = 3;

async function completeWait(runStepId: string): Promise<void> {
  "use step";

  await getPrepareAutomationRunInteractor().completeWait({ runStepId });
}
completeWait.maxRetries = 3;

export async function runAutomation(payload: RunAutomationPayload): Promise<void> {
  "use workflow";

  try {
    const prepared = await prepareRun(payload.automationRunId, payload.companyId);
    if (!prepared || !prepared.ownerUserId) return;

    let failed = false;

    for (const step of prepared.steps) {
      if (step.delaySeconds !== null) {
        await beginWait(step.runStepId);
        await sleep(step.delaySeconds * 1000);
        await completeWait(step.runStepId);
        if (!(await stillApplies(payload.automationRunId, prepared.ownerUserId))) return;
        continue;
      }

      const succeeded = await executeStep(payload.automationRunId, step.runStepId, prepared.ownerUserId);
      if (!succeeded) {
        failed = true;
        break;
      }
    }

    await settleRun(payload.automationRunId, payload.companyId, failed, prepared.ownerUserId);
  } catch (err) {
    await reportFailure(WORKFLOW_NAME, toWorkflowFailure(err));
  }
}
