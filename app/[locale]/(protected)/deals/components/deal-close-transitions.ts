import type { DealDto } from "@/features/deals/deal.schema";

import { DealStatus } from "@/generated/prisma";

export type DealCloseTarget = Pick<DealDto, "id" | "status">;

export function canCloseDeal(deal: Pick<DealDto, "status"> | null | undefined): boolean {
  return deal?.status === DealStatus.open;
}

export function canReopenDeal(deal: Pick<DealDto, "status"> | null | undefined): boolean {
  return deal !== null && deal !== undefined && deal.status !== DealStatus.open;
}
