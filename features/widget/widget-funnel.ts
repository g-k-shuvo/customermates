import type { FunnelStagePoint, FunnelSummary } from "./widget.schema";

export type FunnelStageDefinition = {
  id: string;
  name: string;
  position: number;
};

export type FunnelStageEntry = {
  dealId: string;
  stageId: string;
  enteredAt: Date;
  isWon: boolean;
};

type StageIdsOfDeal = Set<string>;

export function conversionPercent(reached: number, entered: number): number | null {
  if (entered <= 0) return null;

  return (reached / entered) * 100;
}

function stageIdsByDeal(entries: readonly FunnelStageEntry[], knownStageIds: ReadonlySet<string>) {
  const byDeal = new Map<string, StageIdsOfDeal>();

  for (const entry of entries) {
    if (!knownStageIds.has(entry.stageId)) continue;

    const stages = byDeal.get(entry.dealId) ?? new Set<string>();
    stages.add(entry.stageId);
    byDeal.set(entry.dealId, stages);
  }

  return byDeal;
}

function everReachedLaterPosition(
  stagesOfDeal: StageIdsOfDeal,
  positionByStageId: ReadonlyMap<string, number>,
  fromPosition: number,
): boolean {
  for (const stageId of stagesOfDeal) {
    const position = positionByStageId.get(stageId);
    if (position === undefined) continue;

    if (position > fromPosition) return true;
  }

  return false;
}

export function computeFunnelStages(
  stages: readonly FunnelStageDefinition[],
  entries: readonly FunnelStageEntry[],
): FunnelStagePoint[] {
  const ordered = [...stages].sort((left, right) => left.position - right.position);
  const positionByStageId = new Map(ordered.map((stage) => [stage.id, stage.position]));
  const byDeal = stageIdsByDeal(entries, new Set(positionByStageId.keys()));

  return ordered.map((stage, index) => {
    const nextStage = ordered[index + 1];
    let enteredCount = 0;
    let advancedCount = 0;

    for (const stagesOfDeal of byDeal.values()) {
      if (!stagesOfDeal.has(stage.id)) continue;

      enteredCount += 1;
      if (everReachedLaterPosition(stagesOfDeal, positionByStageId, stage.position)) advancedCount += 1;
    }

    return {
      stageId: stage.id,
      label: stage.name,
      position: stage.position,
      enteredCount,
      advancedCount,
      conversionToNextPercent: nextStage ? conversionPercent(advancedCount, enteredCount) : null,
      nextStageLabel: nextStage ? nextStage.name : null,
    };
  });
}

export function computeFunnelSummary(entries: readonly FunnelStageEntry[]): FunnelSummary {
  const wonByDealId = new Map<string, boolean>();

  for (const entry of entries) wonByDealId.set(entry.dealId, entry.isWon || (wonByDealId.get(entry.dealId) ?? false));

  const dealsEntered = wonByDealId.size;
  const wonCount = Array.from(wonByDealId.values()).filter(Boolean).length;

  return {
    dealsEntered,
    wonCount,
    openToWonPercent: conversionPercent(wonCount, dealsEntered),
  };
}
