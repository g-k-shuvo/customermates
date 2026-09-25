import { getProcessWebFormSubmissionInteractor, getPublishLeadCreatedInteractor } from "@/core/di";
import { isInteractorFailure } from "@/core/validation/validation.utils";
import { runAsBackgroundTenant } from "@/core/decorators/background-tenant";

import { reportFailure, reportWarning, toWorkflowFailure } from "./capture-failure";

const WORKFLOW_NAME = "process-web-form-submission";

export type ProcessWebFormSubmissionPayload = {
  submissionId: string;
};

type ProcessedSubmission = {
  failed: boolean;
  leadId: string | null;
  companyId: string | null;
  publisherUserId: string | null;
};

async function processSubmission(submissionId: string): Promise<ProcessedSubmission> {
  "use step";

  const outcome = await getProcessWebFormSubmissionInteractor().invoke({ submissionId });

  if (isInteractorFailure(outcome)) return { failed: true, leadId: null, companyId: null, publisherUserId: null };

  return { failed: false, ...outcome.data };
}
processSubmission.maxRetries = 3;

async function publishLeadCreated(leadId: string, companyId: string, publisherUserId: string | null): Promise<void> {
  "use step";

  const publish = () =>
    getPublishLeadCreatedInteractor().invoke({ leadId, companyId, underTenant: publisherUserId !== null });

  if (publisherUserId) await runAsBackgroundTenant(publisherUserId, publish);
  else await publish();
}
publishLeadCreated.maxRetries = 3;

export async function processWebFormSubmission(payload: ProcessWebFormSubmissionPayload): Promise<void> {
  "use workflow";

  try {
    const result = await processSubmission(payload.submissionId);

    if (result.failed || !result.leadId || !result.companyId) {
      await reportWarning(
        WORKFLOW_NAME,
        `submission ${payload.submissionId} did not map to a lead; the raw payload is kept for a replay`,
      );

      return;
    }

    await publishLeadCreated(result.leadId, result.companyId, result.publisherUserId);
  } catch (err) {
    await reportFailure(WORKFLOW_NAME, toWorkflowFailure(err));
  }
}
