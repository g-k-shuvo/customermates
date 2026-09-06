import type { FunnelStagePoint } from "@/features/widget/widget.schema";

import { describe, expect, it } from "vitest";

import { funnelBarWidthPercent, resolveFunnelWidgetState, widestStageCount } from "../funnel-widget-state";
import { buildFunnelPreviewStages, funnelPreviewSummary } from "../funnel-preview-data";

function stage(enteredCount: number): FunnelStagePoint {
  return {
    stageId: `stage-${enteredCount}`,
    label: "Stage",
    position: 0,
    enteredCount,
    advancedCount: 0,
    conversionToNextPercent: null,
    nextStageLabel: null,
  };
}

describe("resolveFunnelWidgetState", () => {
  it("asks for a pipeline before anything else", () => {
    expect(resolveFunnelWidgetState({ pipelineId: null, stages: [stage(4)], summary: null })).toBe("noPipeline");
  });

  it("distinguishes a pipeline with no open stages from a pipeline with no traffic", () => {
    expect(resolveFunnelWidgetState({ pipelineId: "p1", stages: [], summary: null })).toBe("noStages");
    expect(
      resolveFunnelWidgetState({
        pipelineId: "p1",
        stages: [stage(0)],
        summary: { dealsEntered: 0, wonCount: 0, openToWonPercent: null },
      }),
    ).toBe("noData");
  });

  it("renders the funnel as soon as one deal entered it", () => {
    expect(
      resolveFunnelWidgetState({
        pipelineId: "p1",
        stages: [stage(1)],
        summary: { dealsEntered: 1, wonCount: 0, openToWonPercent: 0 },
      }),
    ).toBe("content");
  });
});

describe("funnelBarWidthPercent", () => {
  it("scales every bar against the widest stage, not against the first one", () => {
    const stages = [stage(20), stage(50), stage(10)];

    expect(widestStageCount(stages)).toBe(50);
    expect(funnelBarWidthPercent(20, 50)).toBe(40);
    expect(funnelBarWidthPercent(50, 50)).toBe(100);
  });

  it("keeps a small non-zero stage visible", () => {
    expect(funnelBarWidthPercent(1, 1000)).toBe(2);
  });

  it("draws nothing at all for a stage nothing entered", () => {
    expect(funnelBarWidthPercent(0, 50)).toBe(0);
    expect(funnelBarWidthPercent(5, 0)).toBe(0);
  });
});

describe("funnel preview", () => {
  it("narrows stage by stage so the preview reads as a funnel", () => {
    const stages = buildFunnelPreviewStages(["One", "Two", "Three", "Four"]);

    expect(stages.map((point) => point.enteredCount)).toEqual([120, 84, 46, 21]);
    expect(stages.at(-1)?.nextStageLabel).toBeNull();
    expect(stages.at(-1)?.conversionToNextPercent).toBeNull();
  });

  it("ties each preview conversion to the next stage it names", () => {
    const stages = buildFunnelPreviewStages(["One", "Two", "Three", "Four"]);

    expect(stages[0].nextStageLabel).toBe("Two");
    expect(stages[0].conversionToNextPercent).toBe(70);
  });

  it("summarises the preview over the deals that entered it", () => {
    expect(funnelPreviewSummary()).toEqual({
      dealsEntered: 120,
      wonCount: 17,
      openToWonPercent: (17 / 120) * 100,
    });
  });
});
