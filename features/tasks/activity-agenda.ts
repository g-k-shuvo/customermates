import { isOverdue } from "./task-overdue";

export const AGENDA_BUCKETS = ["overdue", "today", "tomorrow", "thisWeek", "later", "undated"] as const;

export type AgendaBucket = (typeof AGENDA_BUCKETS)[number];

export type AgendaEntry = {
  dueAt: Date | null;
  completedAt: Date | null;
};

export type AgendaGroup<E> = {
  bucket: AgendaBucket;
  items: E[];
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function localDaysBetween(from: Date, to: Date): number {
  return Math.round((startOfLocalDay(to).getTime() - startOfLocalDay(from).getTime()) / DAY_IN_MS);
}

export function agendaBucketFor(entry: AgendaEntry, now: Date): AgendaBucket {
  if (!entry.dueAt) return "undated";
  if (isOverdue(entry.dueAt, entry.completedAt, now)) return "overdue";

  const days = localDaysBetween(now, entry.dueAt);

  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 7) return "thisWeek";

  return "later";
}

export function compareByDueDate(left: AgendaEntry, right: AgendaEntry): number {
  const leftDue = left.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const rightDue = right.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;

  return leftDue - rightDue;
}

export function groupAgenda<E extends AgendaEntry>(entries: E[], now: Date): AgendaGroup<E>[] {
  const byBucket = new Map<AgendaBucket, E[]>();

  for (const entry of entries) {
    const bucket = agendaBucketFor(entry, now);
    const existing = byBucket.get(bucket);

    if (existing) existing.push(entry);
    else byBucket.set(bucket, [entry]);
  }

  return AGENDA_BUCKETS.flatMap((bucket) => {
    const items = byBucket.get(bucket);

    return items ? [{ bucket, items: [...items].sort(compareByDueDate) }] : [];
  });
}
