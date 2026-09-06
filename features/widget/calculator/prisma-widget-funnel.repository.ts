import type { FunnelCalculation, FunnelForCalculation } from "./widget-calculator.types";

import { BaseRepository } from "@/core/base/base-repository";
import { getWidgetDataFetcher } from "@/core/di";
import { computeFunnelStages, computeFunnelSummary } from "../widget-funnel";
import { funnelPeriodWindow } from "./widget-period";

const EMPTY_FUNNEL: FunnelCalculation = { pipelineName: null, stages: [], summary: null };

export class PrismaWidgetFunnelRepo extends BaseRepository {
  async calculateFunnelData(widget: FunnelForCalculation): Promise<FunnelCalculation> {
    if (!widget.pipelineId) return EMPTY_FUNNEL;

    const fetcher = getWidgetDataFetcher();
    const pipeline = await fetcher.getFunnelPipeline(widget.pipelineId);
    if (!pipeline) return EMPTY_FUNNEL;

    const entries = await fetcher.getFunnelStageEntries(
      widget.pipelineId,
      funnelPeriodWindow(widget.periodDays, new Date()),
    );

    return {
      pipelineName: pipeline.name,
      stages: computeFunnelStages(pipeline.stages, entries),
      summary: computeFunnelSummary(entries),
    };
  }
}
