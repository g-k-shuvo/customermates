import type { WorkflowTenant } from "./workflow-tenant";

import {
  getFailDuplicateScanInteractor,
  getFinishDuplicateScanInteractor,
  getRebuildDuplicateMatchKeysInteractor,
} from "@/core/di";
import { runAsBackgroundTenant } from "@/core/decorators/background-tenant";
import { isInteractorFailure } from "@/core/validation/validation.utils";

import { reportFailure, toWorkflowFailure } from "./capture-failure";

const WORKFLOW_NAME = "scan-duplicates";

export type ScanDuplicatesPayload = { scanId: string; tenant?: WorkflowTenant };

class DuplicateScanStepFailed extends Error {}

async function rebuildKeysPage(userId: string, scanId: string, cursor: string | null): Promise<string | null> {
  "use step";

  const outcome = await runAsBackgroundTenant(userId, () =>
    getRebuildDuplicateMatchKeysInteractor().invoke({ scanId, cursor }),
  );
  if (isInteractorFailure(outcome)) throw new DuplicateScanStepFailed(WORKFLOW_NAME);

  return outcome.data.nextCursor;
}
rebuildKeysPage.maxRetries = 3;

async function finishScan(userId: string, scanId: string): Promise<void> {
  "use step";

  const outcome = await runAsBackgroundTenant(userId, () => getFinishDuplicateScanInteractor().invoke({ scanId }));
  if (isInteractorFailure(outcome)) throw new DuplicateScanStepFailed(WORKFLOW_NAME);
}
finishScan.maxRetries = 3;

async function failScan(userId: string, scanId: string): Promise<void> {
  "use step";

  await runAsBackgroundTenant(userId, () => getFailDuplicateScanInteractor().invoke({ scanId }));
}

export async function scanDuplicates(payload: ScanDuplicatesPayload): Promise<void> {
  "use workflow";

  const userId = payload.tenant?.userId;
  if (!userId) return;

  try {
    let cursor: string | null = null;
    do cursor = await rebuildKeysPage(userId, payload.scanId, cursor);
    while (cursor !== null);

    await finishScan(userId, payload.scanId);
  } catch (error) {
    await failScan(userId, payload.scanId);
    await reportFailure(WORKFLOW_NAME, toWorkflowFailure(error), payload.tenant);
    throw error;
  }
}
