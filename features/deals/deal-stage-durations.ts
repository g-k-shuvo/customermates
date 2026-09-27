import type { StageKind } from "@/generated/prisma";
import type { DealStageDurationsDto } from "./deal-stage-durations.schema";

export type StageDurationDeal = {
  id: string;
  pipelineId: string | null;
  stageId: string | null;
  stageEnteredAt: Date | null;
};

export type StageDurationStage = {
  id: string;
  name: string;
  position: number;
  kind: StageKind;
};

export type StageDurationHistoryRow = {
  toStageId: string;
  enteredAt: Date;
  exitedAt: Date | null;
  durationSeconds: number | null;
};

type StageTotal = { seconds: number; visits: number; lastEnteredAt: Date };

function secondsBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000));
}

function later(left: Date, right: Date): Date {
  return right.getTime() > left.getTime() ? right : left;
}

function openVisitEnd(row: StageDurationHistoryRow, deal: StageDurationDeal, now: Date): Date {
  if (row.toStageId === deal.stageId || !deal.stageEnteredAt) return now;

  return later(row.enteredAt, deal.stageEnteredAt);
}

function closedVisitSeconds(row: StageDurationHistoryRow, exitedAt: Date): number {
  return row.durationSeconds === null ? secondsBetween(row.enteredAt, exitedAt) : Math.max(0, row.durationSeconds);
}

export function summarizeDealStageDurations(args: {
  deal: StageDurationDeal;
  stages: readonly StageDurationStage[];
  history: readonly StageDurationHistoryRow[];
  now: Date;
}): DealStageDurationsDto {
  const { deal, stages, now } = args;
  const history = [...args.history].sort((left, right) => left.enteredAt.getTime() - right.enteredAt.getTime());
  const totals = new Map<string, StageTotal>();

  const addVisit = (stageId: string, enteredAt: Date, seconds: number) => {
    const total = totals.get(stageId);

    if (!total) {
      totals.set(stageId, { seconds, visits: 1, lastEnteredAt: enteredAt });
      return;
    }

    total.seconds += seconds;
    total.visits += 1;
    total.lastEnteredAt = later(total.lastEnteredAt, enteredAt);
  };

  history.forEach((row, index) => {
    if (row.exitedAt) {
      addVisit(row.toStageId, row.enteredAt, closedVisitSeconds(row, row.exitedAt));
      return;
    }

    const exitedAt = history[index + 1]?.enteredAt ?? openVisitEnd(row, deal, now);
    addVisit(row.toStageId, row.enteredAt, secondsBetween(row.enteredAt, exitedAt));
  });

  const last = history.at(-1);
  const lastCoversCurrentStage = Boolean(last && !last.exitedAt && last.toStageId === deal.stageId);

  if (deal.stageId && deal.stageEnteredAt && !lastCoversCurrentStage) {
    const lastEnd = last ? (last.exitedAt ?? openVisitEnd(last, deal, now)) : null;
    const enteredAt = lastEnd ? later(deal.stageEnteredAt, lastEnd) : deal.stageEnteredAt;

    addVisit(deal.stageId, enteredAt, secondsBetween(enteredAt, now));
  }

  return {
    dealId: deal.id,
    pipelineId: deal.pipelineId,
    currentStageId: deal.stageId,
    measuredAt: now,
    stages: stages.map((stage) => {
      const total = totals.get(stage.id);

      return {
        stageId: stage.id,
        name: stage.name,
        position: stage.position,
        kind: stage.kind,
        durationSeconds: total?.seconds ?? 0,
        visits: total?.visits ?? 0,
        isCurrent: stage.id === deal.stageId,
        lastEnteredAt: total?.lastEnteredAt ?? null,
      };
    }),
  };
}
