import { extractAuditChanges } from "@/features/audit-log/audit-log-changes";

function eventPayloadOf(eventData: unknown): Record<string, unknown> | null {
  if (typeof eventData !== "object" || eventData === null || Array.isArray(eventData)) return null;

  const { payload } = eventData as { payload?: unknown };
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;

  return payload as Record<string, unknown>;
}

export function carriesChangedFields(eventData: unknown): boolean {
  const payload = eventPayloadOf(eventData);

  return payload !== null && "changes" in payload;
}

export function changedFieldsOf(eventData: unknown): string[] {
  if (!carriesChangedFields(eventData)) return [];

  return extractAuditChanges(eventData).map((change) => change.columnId ?? change.field);
}
