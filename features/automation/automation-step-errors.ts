export const AUTOMATION_STEP_ERRORS = [
  "assigneeUnavailable",
  "emailNotSent",
  "fieldNotWritable",
  "fieldValueInvalid",
  "fieldValueMissing",
  "interrupted",
  "mergeFieldUnresolved",
  "notesTooLong",
  "notesUnreadable",
  "ownerInactive",
  "ownerNotPermitted",
  "recipientMissing",
  "recordMissing",
  "recordUnsupported",
  "senderUnverified",
  "unexpectedError",
] as const;

export type AutomationStepError = (typeof AUTOMATION_STEP_ERRORS)[number];

export function isAutomationStepError(value: string): value is AutomationStepError {
  return AUTOMATION_STEP_ERRORS.some((code) => code === value);
}
