"use client";

import type { DealDto } from "@/features/deals/deal.schema";

import { DealStatus } from "@/generated/prisma";

import { useRootStore } from "@/core/stores/root-store.provider";

export function useDealLostReasonName(deal: Pick<DealDto, "lostReasonId" | "status"> | null | undefined) {
  const { lostReasonsStore } = useRootStore();

  if (!deal || deal.status !== DealStatus.lost || !deal.lostReasonId) return undefined;

  return lostReasonsStore.lostReasons.find((lostReason) => lostReason.id === deal.lostReasonId)?.name;
}
