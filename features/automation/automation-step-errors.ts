export const AUTOMATION_STEP_ERRORS = [
  "actionUnsupported",
  "assigneeUnavailable",
  "conditionsNoLongerMet",
  "configInvalid",
  "dealNotCreated",
  "emailNotSent",
  "fieldNotWritable",
  "fieldValueInvalid",
  "fieldValueMissing",
  "interrupted",
  "leadNotCreated",
  "mergeFieldUnresolved",
  "noTriggerRecord",
  "notesTooLong",
  "notesUnreadable",
  "ownerInactive",
  "ownerNotPermitted",
  "recipientMissing",
  "recipientSuppressed",
  "recordMissing",
  "recordUnsupported",
  "senderUnverified",
  "stageMoveRejected",
  "taskNotCreated",
  "unexpectedError",
  "webhookRejected",
  "webhookTargetRefused",
  "webhookUnreachable",
] as const;

export type AutomationStepError = (typeof AUTOMATION_STEP_ERRORS)[number];

export function isAutomationStepError(value: string): value is AutomationStepError {
  return AUTOMATION_STEP_ERRORS.some((code) => code === value);
}
