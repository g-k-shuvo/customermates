import type { FunnelStagePoint, FunnelSummary } from "@/features/widget/widget.schema";

export type FunnelWidgetState = "noPipeline" | "noStages" | "noData" | "content";

type FunnelWidgetShape = {
  pipelineId: string | null;
  stages: FunnelStagePoint[];
  summary: FunnelSummary | null;
};

export function resolveFunnelWidgetState(widget: FunnelWidgetShape): FunnelWidgetState {
  if (!widget.pipelineId) return "noPipeline";
  if (widget.stages.length === 0) return "noStages";
  if ((widget.summary?.dealsEntered ?? 0) === 0) return "noData";

  return "content";
}

export function widestStageCount(stages: readonly FunnelStagePoint[]): number {
  return stages.reduce((widest, stage) => Math.max(widest, stage.enteredCount), 0);
}

export function funnelBarWidthPercent(enteredCount: number, widestCount: number): number {
  if (enteredCount <= 0 || widestCount <= 0) return 0;

  return Math.max(2, Math.round((enteredCount / widestCount) * 100));
}
