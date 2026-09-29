import { runAgentTurn } from "./agent-turn";
import { backfillConnectedAccount } from "./backfill-connected-account";
import { deliverWebhook } from "./deliver-webhook";
import { reconcileRoutineRuns } from "./reconcile-routine-runs";
import { runAutomation } from "./run-automation";
import { runBulkJob } from "./run-bulk-job";
import { runRoutine } from "./run-routine";
import { scanDuplicates } from "./scan-duplicates";
import { sendCampaign } from "./send-campaign";
import { sendMailOutbox } from "./send-mail-outbox";
import { processWebFormSubmission } from "./process-web-form-submission";
import { syncMailboxes } from "./sync-mailboxes";
import { syncCalendars } from "./sync-calendars";
import { triggerTestError } from "./trigger-test-error";

export const WORKFLOW_REGISTRY = {
  "agent-turn": runAgentTurn,
  "backfill-connected-account": backfillConnectedAccount,
  "deliver-webhook": deliverWebhook,
  "reconcile-routine-runs": reconcileRoutineRuns,
  "run-automation": runAutomation,
  "run-bulk-job": runBulkJob,
  "run-routine": runRoutine,
  "scan-duplicates": scanDuplicates,
  "send-campaign": sendCampaign,
  "send-mail-outbox": sendMailOutbox,
  "process-web-form-submission": processWebFormSubmission,
  "sync-mailboxes": syncMailboxes,
  "sync-calendars": syncCalendars,
  "trigger-test-error": triggerTestError,
} as const;

export type WorkflowId = keyof typeof WORKFLOW_REGISTRY;

export type WorkflowPayload<TId extends WorkflowId> = Parameters<(typeof WORKFLOW_REGISTRY)[TId]>[0];
