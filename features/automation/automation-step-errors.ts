export const AUTOMATION_STEP_ERRORS = [
  "assigneeUnavailable",
  "fieldNotWritable",
  "fieldValueInvalid",
  "fieldValueMissing",
  "interrupted",
  "notesTooLong",
  "notesUnreadable",
  "ownerInactive",
  "ownerNotPermitted",
  "recordMissing",
  "recordUnsupported",
  "unexpectedError",
] as const;

export type AutomationStepError = (typeof AUTOMATION_STEP_ERRORS)[number];

export function isAutomationStepError(value: string): value is AutomationStepError {
  return AUTOMATION_STEP_ERRORS.some((code) => code === value);
}
