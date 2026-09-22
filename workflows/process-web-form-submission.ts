import { getProcessWebFormSubmissionInteractor } from "@/core/di";
import { isInteractorFailure } from "@/core/validation/validation.utils";

import { reportFailure, reportWarning, toWorkflowFailure } from "./capture-failure";

const WORKFLOW_NAME = "process-web-form-submission";

export type ProcessWebFormSubmissionPayload = {
  submissionId: string;
};

async function processSubmission(submissionId: string): Promise<{ failed: boolean }> {
  "use step";

  const outcome = await getProcessWebFormSubmissionInteractor().invoke({ submissionId });

  return { failed: isInteractorFailure(outcome) };
}
processSubmission.maxRetries = 3;

export async function processWebFormSubmission(payload: ProcessWebFormSubmissionPayload): Promise<void> {
  "use workflow";

  try {
    const result = await processSubmission(payload.submissionId);

    if (result.failed) {
      await reportWarning(
        WORKFLOW_NAME,
        `submission ${payload.submissionId} did not map to a lead; the raw payload is kept for a replay`,
      );
    }
  } catch (err) {
    await reportFailure(WORKFLOW_NAME, toWorkflowFailure(err));
  }
}
