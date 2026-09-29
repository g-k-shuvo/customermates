import {
  getNewLeadAssignment,
  getProcessWebFormSubmissionInteractor,
  getProcessWebFormSubmissionRepo,
  getPublishLeadCreatedInteractor,
} from "@/core/di";
import { isInteractorFailure } from "@/core/validation/validation.utils";
import { runAsBackgroundTenant } from "@/core/decorators/background-tenant";
import { AppErrorCode, appErrorDetailsInCauseChain } from "@/core/errors/app-errors";
import { prismaClientError } from "@/core/errors/prisma-client-error";

import { reportFailure, reportWarning, toWorkflowFailure } from "./capture-failure";

const WORKFLOW_NAME = "process-web-form-submission";

export type ProcessWebFormSubmissionPayload = {
  submissionId: string;
};

type ProcessedSubmission = {
  failed: boolean;
  appended: boolean;
  leadId: string | null;
  companyId: string | null;
  publisherUserId: string | null;
};

async function processSubmission(submissionId: string): Promise<ProcessedSubmission> {
  "use step";

  const outcome = await getProcessWebFormSubmissionInteractor().invoke({ submissionId });

  if (isInteractorFailure(outcome))
    return { failed: true, appended: false, leadId: null, companyId: null, publisherUserId: null };

  return { failed: false, ...outcome.data };
}
processSubmission.maxRetries = 3;

export async function assignWebFormLead(leadId: string, companyId: string): Promise<void> {
  "use step";

  const assignment = getNewLeadAssignment();
  const actorId = await assignment.companyActor(companyId);
  if (!actorId) return;

  const lead = await getProcessWebFormSubmissionRepo().findLeadForEventOrThrowUnscoped(leadId);
  await runAsBackgroundTenant(actorId, () => assignment.apply(companyId, lead));
}

export async function publishLeadCreated(
  leadId: string,
  companyId: string,
  publisherUserId: string | null,
): Promise<void> {
  "use step";

  await assignWebFormLead(leadId, companyId).catch((error: unknown) =>
    reportFailure(
      WORKFLOW_NAME,
      toWorkflowFailure(error),
      publisherUserId ? { userId: publisherUserId, companyId } : undefined,
    ),
  );

  const publisher = getPublishLeadCreatedInteractor();
  const loaded = await publisher.invoke({ leadId, companyId });
  if (isInteractorFailure(loaded)) return;

  const reportUnpublished = (error: unknown) =>
    reportFailure(
      WORKFLOW_NAME,
      toWorkflowFailure(error),
      publisherUserId ? { userId: publisherUserId, companyId } : undefined,
    );

  const publishedAsTenant = publisherUserId
    ? await runAsBackgroundTenant(publisherUserId, () =>
        publisher.publishAsTenant(loaded.data, companyId).catch(reportUnpublished),
      ).then(
        () => true,
        (error: unknown) => {
          if (publisherCannotAct(error)) return false;

          throw error;
        },
      )
    : false;

  if (!publishedAsTenant) await publisher.publishAsSystem(loaded.data, companyId).catch(reportUnpublished);
}
publishLeadCreated.maxRetries = 3;

function publisherCannotAct(error: unknown): boolean {
  return (
    appErrorDetailsInCauseChain(error)?.code === AppErrorCode.inactiveUser || prismaClientError(error)?.status === 404
  );
}

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

    if (!result.appended) await publishLeadCreated(result.leadId, result.companyId, result.publisherUserId);
  } catch (err) {
    await reportFailure(WORKFLOW_NAME, toWorkflowFailure(err));
  }
}
