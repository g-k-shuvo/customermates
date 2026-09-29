import type { WorkflowTenant } from "./workflow-tenant";

import { sleep } from "workflow";

import { getFailBulkJobInteractor, getFinishBulkJobInteractor, getRunBulkJobPageInteractor } from "@/core/di";
import { runAsBackgroundTenant } from "@/core/decorators/background-tenant";
import { isInteractorFailure } from "@/core/validation/validation.utils";
import { BULK_JOB_PAGE_PAUSE_MS } from "@/features/bulk-job/bulk-job.constants";

import { reportFailure, toWorkflowFailure } from "./capture-failure";

const WORKFLOW_NAME = "run-bulk-job";

export type RunBulkJobPayload = { jobId: string; tenant?: WorkflowTenant };

class BulkJobStepFailed extends Error {}

async function runPage(userId: string, jobId: string, cursor: string | null): Promise<string | null> {
  "use step";

  const outcome = await runAsBackgroundTenant(userId, () => getRunBulkJobPageInteractor().invoke({ jobId, cursor }));
  if (isInteractorFailure(outcome)) throw new BulkJobStepFailed(WORKFLOW_NAME);

  return outcome.data.nextCursor;
}
runPage.maxRetries = 3;

async function finishJob(userId: string, jobId: string): Promise<void> {
  "use step";

  const outcome = await runAsBackgroundTenant(userId, () => getFinishBulkJobInteractor().invoke({ id: jobId }));
  if (isInteractorFailure(outcome)) throw new BulkJobStepFailed(WORKFLOW_NAME);
}
finishJob.maxRetries = 3;

async function failJob(userId: string, jobId: string): Promise<void> {
  "use step";

  await runAsBackgroundTenant(userId, () => getFailBulkJobInteractor().invoke({ id: jobId }));
}

export async function runBulkJob(payload: RunBulkJobPayload): Promise<void> {
  "use workflow";

  const userId = payload.tenant?.userId;
  if (!userId) return;

  try {
    let cursor: string | null = await runPage(userId, payload.jobId, null);
    while (cursor !== null) {
      await sleep(BULK_JOB_PAGE_PAUSE_MS);
      cursor = await runPage(userId, payload.jobId, cursor);
    }

    await finishJob(userId, payload.jobId);
  } catch (error) {
    await failJob(userId, payload.jobId);
    await reportFailure(WORKFLOW_NAME, toWorkflowFailure(error), payload.tenant);
    throw error;
  }
}
