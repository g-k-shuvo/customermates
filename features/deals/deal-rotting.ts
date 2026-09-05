import { addDays } from "date-fns";
import { DealStatus } from "@/generated/prisma";

export function computeRottingAt(
  status: DealStatus,
  stageEnteredAt: Date | null | undefined,
  rottingDays: number | null | undefined,
): Date | null {
  if (status !== DealStatus.open) return null;
  if (!stageEnteredAt) return null;
  if (typeof rottingDays !== "number" || !Number.isFinite(rottingDays) || rottingDays <= 0) return null;

  return addDays(stageEnteredAt, rottingDays);
}

export function isRotting(rottingAt: Date | null | undefined, now: Date): boolean {
  if (!rottingAt) return false;

  return rottingAt.getTime() <= now.getTime();
}
