import type { FunnelStagePoint, FunnelSummary } from "@/features/widget/widget.schema";

import { conversionPercent } from "@/features/widget/widget-funnel";

const PREVIEW_ENTERED_COUNTS = [120, 84, 46, 21];
const PREVIEW_WON_COUNT = 17;

export function buildFunnelPreviewStages(labels: string[]): FunnelStagePoint[] {
  const usable = labels.slice(0, PREVIEW_ENTERED_COUNTS.length);

  return usable.map((label, index) => {
    const enteredCount = PREVIEW_ENTERED_COUNTS[index];
    const nextStageLabel = usable[index + 1] ?? null;
    const advancedCount = nextStageLabel ? PREVIEW_ENTERED_COUNTS[index + 1] : 0;

    return {
      stageId: `preview-stage-${index}`,
      label,
      position: index,
      enteredCount,
      advancedCount,
      conversionToNextPercent: nextStageLabel ? conversionPercent(advancedCount, enteredCount) : null,
      nextStageLabel,
    };
  });
}

export function funnelPreviewSummary(): FunnelSummary {
  return {
    dealsEntered: PREVIEW_ENTERED_COUNTS[0],
    wonCount: PREVIEW_WON_COUNT,
    openToWonPercent: conversionPercent(PREVIEW_WON_COUNT, PREVIEW_ENTERED_COUNTS[0]),
  };
}
