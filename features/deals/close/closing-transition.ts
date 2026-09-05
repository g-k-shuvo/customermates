import { DealStatus } from "@/generated/prisma";

export type DealClosingWrite = {
  status: DealStatus;
  probability: number | null;
  wonAt: Date | null;
  lostAt: Date | null;
  closedAt: Date | null;
  lostReasonId: string | null;
  lostNotes: string | null;
};

export type DealStageMove = { stageId: string; stageEnteredAt: Date } | Record<string, never>;

export function wonTransition(closedAt: Date): DealClosingWrite {
  return {
    status: DealStatus.won,
    probability: 100,
    wonAt: closedAt,
    lostAt: null,
    closedAt,
    lostReasonId: null,
    lostNotes: null,
  };
}

export function lostTransition(closedAt: Date, lostReasonId: string, lostNotes: string | null): DealClosingWrite {
  return {
    status: DealStatus.lost,
    probability: 0,
    wonAt: null,
    lostAt: closedAt,
    closedAt,
    lostReasonId,
    lostNotes,
  };
}

export function reopenTransition(): DealClosingWrite {
  return {
    status: DealStatus.open,
    probability: null,
    wonAt: null,
    lostAt: null,
    closedAt: null,
    lostReasonId: null,
    lostNotes: null,
  };
}

export function dealStageMove(
  targetStageId: string | null,
  currentStageId: string | null,
  movedAt: Date,
): DealStageMove {
  if (!targetStageId || targetStageId === currentStageId) return {};

  return { stageId: targetStageId, stageEnteredAt: movedAt };
}
