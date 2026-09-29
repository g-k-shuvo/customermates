import type { WorkflowTenant } from "./workflow-tenant";

import { sleep } from "workflow";

import { getFailCampaignInteractor, getFinishCampaignInteractor, getSendCampaignChunkInteractor } from "@/core/di";
import { runAsBackgroundTenant } from "@/core/decorators/background-tenant";
import { isInteractorFailure } from "@/core/validation/validation.utils";
import { CAMPAIGN_CHUNK_PAUSE_MS } from "@/features/campaigns/campaign.constants";

import { reportFailure, toWorkflowFailure } from "./capture-failure";

const WORKFLOW_NAME = "send-campaign";

export type SendCampaignPayload = { campaignId: string; tenant?: WorkflowTenant };

class CampaignStepFailed extends Error {}

async function sendChunk(userId: string, campaignId: string): Promise<number> {
  "use step";

  const outcome = await runAsBackgroundTenant(userId, () =>
    getSendCampaignChunkInteractor().invoke({ id: campaignId }),
  );
  if (isInteractorFailure(outcome)) throw new CampaignStepFailed(WORKFLOW_NAME);

  return outcome.data.remaining;
}
sendChunk.maxRetries = 3;

async function finishCampaign(userId: string, campaignId: string): Promise<void> {
  "use step";

  const outcome = await runAsBackgroundTenant(userId, () => getFinishCampaignInteractor().invoke({ id: campaignId }));
  if (isInteractorFailure(outcome)) throw new CampaignStepFailed(WORKFLOW_NAME);
}
finishCampaign.maxRetries = 3;

async function failCampaign(userId: string, campaignId: string): Promise<void> {
  "use step";

  await runAsBackgroundTenant(userId, () => getFailCampaignInteractor().invoke({ id: campaignId }));
}

export async function sendCampaign(payload: SendCampaignPayload): Promise<void> {
  "use workflow";

  const userId = payload.tenant?.userId;
  if (!userId) return;

  try {
    let remaining = await sendChunk(userId, payload.campaignId);
    while (remaining > 0) {
      await sleep(CAMPAIGN_CHUNK_PAUSE_MS);
      remaining = await sendChunk(userId, payload.campaignId);
    }

    await finishCampaign(userId, payload.campaignId);
  } catch (error) {
    await failCampaign(userId, payload.campaignId);
    await reportFailure(WORKFLOW_NAME, toWorkflowFailure(error), payload.tenant);
    throw error;
  }
}
