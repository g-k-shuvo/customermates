import { sleep } from "workflow";

import { getExecuteAutomationStepInteractor, getPrepareAutomationRunInteractor } from "@/core/di";
import { isInteractorFailure } from "@/core/validation/validation.utils";

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

async function prepareRun(automationRunId: string, companyId: string): Promise<PreparedRun | null> {
  "use step";

  const outcome = await getPrepareAutomationRunInteractor().invoke({ automationRunId, companyId });

  return isInteractorFailure(outcome) ? null : outcome.data;
}
prepareRun.maxRetries = 3;

async function executeStep(automationRunId: string, runStepId: string, ownerUserId: string): Promise<boolean> {
  "use step";

  const outcome = await getExecuteAutomationStepInteractor().invoke({ automationRunId, runStepId, ownerUserId });

  return !isInteractorFailure(outcome);
}
executeStep.maxRetries = 2;

async function settleRun(automationRunId: string, companyId: string, failed: boolean): Promise<void> {
  "use step";

  await getPrepareAutomationRunInteractor().settle({ automationRunId, companyId, failed });
}
settleRun.maxRetries = 3;

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
        continue;
      }

      const succeeded = await executeStep(payload.automationRunId, step.runStepId, prepared.ownerUserId);
      if (!succeeded) {
        failed = true;
        break;
      }
    }

    await settleRun(payload.automationRunId, payload.companyId, failed);
  } catch (err) {
    await reportFailure(WORKFLOW_NAME, toWorkflowFailure(err));
  }
}
