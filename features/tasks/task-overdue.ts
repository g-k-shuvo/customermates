import type { Prisma } from "@/generated/prisma";

export function isOverdue(dueAt: Date | null | undefined, completedAt: Date | null | undefined, now: Date): boolean {
  if (!dueAt) return false;
  if (completedAt) return false;

  return dueAt.getTime() <= now.getTime();
}

export function overdueWhere(now: Date): Prisma.TaskWhereInput {
  return { completedAt: null, dueAt: { lte: now } };
}

export function notOverdueWhere(now: Date): Prisma.TaskWhereInput {
  return { OR: [{ completedAt: { not: null } }, { dueAt: null }, { dueAt: { gt: now } }] };
}
