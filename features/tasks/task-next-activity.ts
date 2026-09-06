import type { ActivityKind } from "@/generated/prisma";
import type { NextActivityDto } from "./task.schema";

import { isOverdue } from "./task-overdue";

export type NextActivityCandidate = {
  id: string;
  name: string;
  activityKind: ActivityKind | null;
  dueAt: Date;
  createdAt: Date;
  dealIds: string[];
};

export type ScheduledActivity = {
  id: string;
  name: string;
  activityKind: ActivityKind | null;
  dueAt: Date | null;
  completedAt: Date | null;
  createdAt?: Date;
};

type Ordered = { id: string; dueAt: Date; createdAt?: Date };

export function comesFirst(candidate: Ordered, incumbent: Ordered): boolean {
  if (candidate.dueAt.getTime() !== incumbent.dueAt.getTime())
    return candidate.dueAt.getTime() < incumbent.dueAt.getTime();

  const candidateCreatedAt = candidate.createdAt?.getTime() ?? 0;
  const incumbentCreatedAt = incumbent.createdAt?.getTime() ?? 0;

  if (candidateCreatedAt !== incumbentCreatedAt) return candidateCreatedAt < incumbentCreatedAt;

  return candidate.id < incumbent.id;
}

export function selectNextActivities(candidates: NextActivityCandidate[], now: Date): Map<string, NextActivityDto> {
  const earliest = new Map<string, NextActivityCandidate>();

  for (const candidate of candidates) {
    for (const dealId of candidate.dealIds) {
      const incumbent = earliest.get(dealId);

      if (!incumbent || comesFirst(candidate, incumbent)) earliest.set(dealId, candidate);
    }
  }

  return new Map(
    [...earliest].map(([dealId, activity]) => [
      dealId,
      {
        id: activity.id,
        name: activity.name,
        activityKind: activity.activityKind,
        dueAt: activity.dueAt,
        isOverdue: isOverdue(activity.dueAt, null, now),
      },
    ]),
  );
}

export function nextActivityOf(activities: ScheduledActivity[], now: Date): NextActivityDto | null {
  let earliest: (ScheduledActivity & { dueAt: Date }) | null = null;

  for (const activity of activities) {
    if (activity.completedAt) continue;
    if (!activity.dueAt) continue;

    const candidate = { ...activity, dueAt: activity.dueAt };

    if (!earliest || comesFirst(candidate, earliest)) earliest = candidate;
  }

  if (!earliest) return null;

  return {
    id: earliest.id,
    name: earliest.name,
    activityKind: earliest.activityKind,
    dueAt: earliest.dueAt,
    isOverdue: isOverdue(earliest.dueAt, null, now),
  };
}
