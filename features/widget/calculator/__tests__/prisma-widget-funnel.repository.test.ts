import { beforeEach, describe, expect, it, vi } from "vitest";

const fetcher = vi.hoisted(() => ({
  getFunnelPipeline: vi.fn(),
  getFunnelStageEntries: vi.fn(),
}));

vi.mock("@/core/di", () => ({ getWidgetDataFetcher: () => fetcher }));

import { PrismaWidgetFunnelRepo } from "../prisma-widget-funnel.repository";

const PIPELINE = {
  name: "Sales",
  stages: [
    { id: "lead", name: "Lead in", position: 0 },
    { id: "demo", name: "Demo", position: 1 },
  ],
};

function entry(dealId: string, stageId: string, day: number, isWon = false) {
  return { dealId, stageId, enteredAt: new Date(Date.UTC(2026, 0, day)), isWon };
}

describe("PrismaWidgetFunnelRepo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an empty funnel without querying when no pipeline is configured", async () => {
    const result = await new PrismaWidgetFunnelRepo().calculateFunnelData({ pipelineId: null, periodDays: null });

    expect(result).toEqual({ pipelineName: null, stages: [], summary: null });
    expect(fetcher.getFunnelStageEntries).not.toHaveBeenCalled();
  });

  it("returns an empty funnel when the pipeline is gone instead of counting stage history", async () => {
    fetcher.getFunnelPipeline.mockResolvedValue(null);

    const result = await new PrismaWidgetFunnelRepo().calculateFunnelData({ pipelineId: "gone", periodDays: 30 });

    expect(result).toEqual({ pipelineName: null, stages: [], summary: null });
    expect(fetcher.getFunnelStageEntries).not.toHaveBeenCalled();
  });

  it("counts distinct deals per stage from the raw stage entries", async () => {
    fetcher.getFunnelPipeline.mockResolvedValue(PIPELINE);
    fetcher.getFunnelStageEntries.mockResolvedValue([
      entry("d1", "lead", 1, true),
      entry("d1", "demo", 2, true),
      entry("d2", "lead", 1),
      entry("d2", "lead", 3),
    ]);

    const result = await new PrismaWidgetFunnelRepo().calculateFunnelData({ pipelineId: "sales", periodDays: 30 });

    expect(result.pipelineName).toBe("Sales");
    expect(result.stages.map((stage) => stage.enteredCount)).toEqual([2, 1]);
    expect(result.summary).toEqual({ dealsEntered: 2, wonCount: 1, openToWonPercent: 50 });
  });

  it("bounds the stage-entry query by the configured period", async () => {
    fetcher.getFunnelPipeline.mockResolvedValue(PIPELINE);
    fetcher.getFunnelStageEntries.mockResolvedValue([]);

    await new PrismaWidgetFunnelRepo().calculateFunnelData({ pipelineId: "sales", periodDays: 30 });

    const [pipelineId, window] = fetcher.getFunnelStageEntries.mock.calls[0];
    const spannedDays = (window.to.getTime() - window.from.getTime()) / 86_400_000;

    expect(pipelineId).toBe("sales");
    expect(spannedDays).toBe(30);
  });

  it("falls back to a bounded default window when no period is stored", async () => {
    fetcher.getFunnelPipeline.mockResolvedValue(PIPELINE);
    fetcher.getFunnelStageEntries.mockResolvedValue([]);

    await new PrismaWidgetFunnelRepo().calculateFunnelData({ pipelineId: "sales", periodDays: null });

    const [, window] = fetcher.getFunnelStageEntries.mock.calls[0];

    expect((window.to.getTime() - window.from.getTime()) / 86_400_000).toBe(90);
  });
});
