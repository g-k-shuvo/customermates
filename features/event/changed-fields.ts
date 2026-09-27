import { extractAuditChanges } from "@/features/audit-log/audit-log-changes";

export type EventFieldChanges = readonly string[];

function payloadOf(eventData: unknown): object | null {
  if (typeof eventData !== "object" || eventData === null) return null;

  const { payload } = eventData as { payload?: unknown };

  return typeof payload === "object" && payload !== null ? payload : null;
}

export function fieldChangesIn(eventData: unknown): EventFieldChanges | null {
  const payload = payloadOf(eventData);
  if (!payload || !("changes" in payload)) return null;
  if (payload.changes === null || payload.changes === undefined) return [];

  return extractAuditChanges(eventData).map((change) => change.columnId ?? change.field);
}
