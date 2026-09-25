import { runAgentTurn } from "./agent-turn";
import { backfillConnectedAccount } from "./backfill-connected-account";
import { deliverWebhook } from "./deliver-webhook";
import { reconcileRoutineRuns } from "./reconcile-routine-runs";
import { runAutomation } from "./run-automation";
import { runRoutine } from "./run-routine";
import { processWebFormSubmission } from "./process-web-form-submission";
import { syncMailboxes } from "./sync-mailboxes";
import { triggerTestError } from "./trigger-test-error";

export const WORKFLOW_REGISTRY = {
  "agent-turn": runAgentTurn,
  "backfill-connected-account": backfillConnectedAccount,
  "deliver-webhook": deliverWebhook,
  "reconcile-routine-runs": reconcileRoutineRuns,
  "run-automation": runAutomation,
  "run-routine": runRoutine,
  "process-web-form-submission": processWebFormSubmission,
  "sync-mailboxes": syncMailboxes,
  "trigger-test-error": triggerTestError,
} as const;

export type WorkflowId = keyof typeof WORKFLOW_REGISTRY;

export type WorkflowPayload<TId extends WorkflowId> = Parameters<(typeof WORKFLOW_REGISTRY)[TId]>[0];
