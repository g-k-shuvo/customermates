import { beforeEach, describe, expect, it, vi } from "vitest";

import { AggregationType, EntityType, WidgetGroupByType } from "@/generated/prisma";

const mocks = vi.hoisted(() => ({
  countByCustomColumn: vi.fn(),
  getDealsForEntityType: vi.fn(),
  getEntitiesForGrouping: vi.fn(),
  getEntityCount: vi.fn(),
  sumDealField: vi.fn(),
  groupDealsByPipelinePosition: vi.fn(),
  getStagePositions: vi.fn(),
  getPipelinePositions: vi.fn(),
  getWinRateRows: vi.fn(),
  getSalesCycleRows: vi.fn(),
  getStageDurationRows: vi.fn(),
}));

const grouping = vi.hoisted(() => ({
  buildCustomColumnPoints: vi.fn(),
  groupDealsByCustomColumn: vi.fn(),
  groupDealsByEntityType: vi.fn(),
  groupEntitiesByEntityType: vi.fn(),
  buildPipelinePositionPoints: vi.fn(),
  buildWinRatePoints: vi.fn(),
  buildDurationPoints: vi.fn(),
}));

vi.mock("@/core/di", () => ({
  getCustomColumnRepo: () => ({ findById: vi.fn() }),
  getWidgetDataFetcher: () => mocks,
  getWidgetGroupingService: () => grouping,
}));

import { PrismaWidgetCalculatorRepo } from "../prisma-widget-calculator.repository";

function widget(
  entityType: EntityType,
  aggregationType: AggregationType,
  groupByType: WidgetGroupByType = WidgetGroupByType.none,
) {
  return {
    aggregationType,
    dealFilters: [],
    entityFilters: [],
    entityType,
    groupByCustomColumnId: null,
    groupByType,
    periodDays: null,
  };
}

const ASCENDING_STAGE_POINTS = [
  { labelKind: "literal" as const, label: "Lead in", value: 1 },
  { labelKind: "literal" as const, label: "Demo", value: 4 },
  { labelKind: "literal" as const, label: "Negotiation", value: 9 },
];

describe("PrismaWidgetCalculatorRepo total labels", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a semantic total for an ungrouped entity count", async () => {
    mocks.getEntityCount.mockResolvedValue(5);

    await expect(
      new PrismaWidgetCalculatorRepo().calculateWidgetData(widget(EntityType.contact, AggregationType.count)),
    ).resolves.toEqual({ data: [{ labelKind: "system", systemLabelKey: "total", value: 5 }], dataSummary: null });
  });

  it("returns a semantic total for an ungrouped deal value", async () => {
    mocks.sumDealField.mockResolvedValue(1200);

    await expect(
      new PrismaWidgetCalculatorRepo().calculateWidgetData(widget(EntityType.deal, AggregationType.dealValue)),
    ).resolves.toEqual({ data: [{ labelKind: "system", systemLabelKey: "total", value: 1200 }], dataSummary: null });
  });

  it("returns a semantic total for ungrouped service revenue", async () => {
    mocks.getDealsForEntityType.mockResolvedValue([
      {
        services: [
          { quantity: 2, service: { amount: 30 } },
          { quantity: 1, service: { amount: 15 } },
        ],
      },
    ]);

    await expect(
      new PrismaWidgetCalculatorRepo().calculateWidgetData(widget(EntityType.service, AggregationType.dealValue)),
    ).resolves.toEqual({ data: [{ labelKind: "system", systemLabelKey: "total", value: 75 }], dataSummary: null });
  });

  it("returns a semantic total for ungrouped service quantity", async () => {
    mocks.sumDealField.mockResolvedValue(7);

    await expect(
      new PrismaWidgetCalculatorRepo().calculateWidgetData(widget(EntityType.service, AggregationType.dealQuantity)),
    ).resolves.toEqual({ data: [{ labelKind: "system", systemLabelKey: "total", value: 7 }], dataSummary: null });
  });
});

describe("PrismaWidgetCalculatorRepo pipeline ordering", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps stage-grouped points in pipeline order instead of sorting them by value", async () => {
    mocks.groupDealsByPipelinePosition.mockResolvedValue([]);
    mocks.getStagePositions.mockResolvedValue([]);
    grouping.buildPipelinePositionPoints.mockReturnValue(ASCENDING_STAGE_POINTS);

    const result = await new PrismaWidgetCalculatorRepo().calculateWidgetData(
      widget(EntityType.deal, AggregationType.count, WidgetGroupByType.dealStage),
    );

    expect(result.data.map((point) => point.value)).toEqual([1, 4, 9]);
  });

  it("keeps pipeline-grouped points in pipeline order and asks for pipelines, not stages", async () => {
    mocks.groupDealsByPipelinePosition.mockResolvedValue([]);
    mocks.getPipelinePositions.mockResolvedValue([]);
    grouping.buildPipelinePositionPoints.mockReturnValue(ASCENDING_STAGE_POINTS);

    const result = await new PrismaWidgetCalculatorRepo().calculateWidgetData(
      widget(EntityType.deal, AggregationType.dealValue, WidgetGroupByType.dealPipeline),
    );

    expect(mocks.getPipelinePositions).toHaveBeenCalled();
    expect(mocks.getStagePositions).not.toHaveBeenCalled();
    expect(result.data.map((point) => point.value)).toEqual([1, 4, 9]);
  });

  it("still sorts a non-positional grouping by value, largest first", async () => {
    mocks.getDealsForEntityType.mockResolvedValue([]);
    grouping.groupDealsByEntityType.mockReturnValue(ASCENDING_STAGE_POINTS);

    const result = await new PrismaWidgetCalculatorRepo().calculateWidgetData(
      widget(EntityType.deal, AggregationType.dealValue, WidgetGroupByType.deal),
    );

    expect(result.data.map((point) => point.value)).toEqual([9, 4, 1]);
  });
});

describe("PrismaWidgetCalculatorRepo win rate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("summarises the period from won and lost only, so open deals stay out of the denominator", async () => {
    mocks.getWinRateRows.mockResolvedValue([
      { key: "stage-lead", wonCount: 3, lostCount: 1, wonValue: 3000, lostValue: 1000 },
      { key: "stage-demo", wonCount: 1, lostCount: 3, wonValue: 1000, lostValue: 3000 },
    ]);
    mocks.getStagePositions.mockResolvedValue([]);
    grouping.buildWinRatePoints.mockReturnValue([]);

    const result = await new PrismaWidgetCalculatorRepo().calculateWidgetData(
      widget(EntityType.deal, AggregationType.winRate, WidgetGroupByType.dealStage),
    );

    expect(result.dataSummary).toEqual({ headline: 50, median: null, sampleSize: 8 });
  });

  it("reports no rate at all when nothing closed inside the period", async () => {
    mocks.getWinRateRows.mockResolvedValue([]);
    grouping.buildWinRatePoints.mockReturnValue([]);

    const result = await new PrismaWidgetCalculatorRepo().calculateWidgetData(
      widget(EntityType.deal, AggregationType.winRate),
    );

    expect(result.dataSummary).toEqual({ headline: null, median: null, sampleSize: 0 });
  });
});

describe("PrismaWidgetCalculatorRepo closed-deal metrics stored against the deal stage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not group a stored win-rate widget by stage, where every closed deal would land on won or lost", async () => {
    mocks.getWinRateRows.mockResolvedValue([]);
    grouping.buildWinRatePoints.mockReturnValue([]);

    await new PrismaWidgetCalculatorRepo().calculateWidgetData(
      widget(EntityType.deal, AggregationType.winRate, WidgetGroupByType.dealStage),
    );

    expect(mocks.getStagePositions).not.toHaveBeenCalled();
    expect(mocks.getWinRateRows.mock.calls[0][0].groupByType).toBe(WidgetGroupByType.none);
    expect(grouping.buildWinRatePoints.mock.calls[0][2]).toBe(false);
  });

  it("does not group a stored sales-cycle widget by stage either", async () => {
    mocks.getSalesCycleRows.mockResolvedValue([]);
    grouping.buildDurationPoints.mockReturnValue([]);

    await new PrismaWidgetCalculatorRepo().calculateWidgetData(
      widget(EntityType.deal, AggregationType.salesCycleDays, WidgetGroupByType.dealStage),
    );

    expect(mocks.getStagePositions).not.toHaveBeenCalled();
    expect(mocks.getSalesCycleRows.mock.calls[0][0].groupByType).toBe(WidgetGroupByType.none);
    expect(grouping.buildDurationPoints.mock.calls[0][2]).toBe(false);
  });

  it("keeps grouping time in stage by stage, which the stage history records honestly", async () => {
    mocks.getStageDurationRows.mockResolvedValue([]);
    mocks.getStagePositions.mockResolvedValue([]);
    grouping.buildDurationPoints.mockReturnValue([]);

    await new PrismaWidgetCalculatorRepo().calculateWidgetData(
      widget(EntityType.deal, AggregationType.stageDurationDays, WidgetGroupByType.dealStage),
    );

    expect(mocks.getStagePositions).toHaveBeenCalled();
    expect(mocks.getStageDurationRows.mock.calls[0][0].groupByType).toBe(WidgetGroupByType.dealStage);
    expect(grouping.buildDurationPoints.mock.calls[0][2]).toBe(true);
  });

  it("keeps grouping win rate by pipeline, which a close does not move the deal out of", async () => {
    mocks.getWinRateRows.mockResolvedValue([]);
    mocks.getPipelinePositions.mockResolvedValue([]);
    grouping.buildWinRatePoints.mockReturnValue([]);

    await new PrismaWidgetCalculatorRepo().calculateWidgetData(
      widget(EntityType.deal, AggregationType.winRate, WidgetGroupByType.dealPipeline),
    );

    expect(mocks.getPipelinePositions).toHaveBeenCalled();
    expect(grouping.buildWinRatePoints.mock.calls[0][2]).toBe(true);
  });
});

describe("PrismaWidgetCalculatorRepo duration summaries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("carries the median beside the mean for a skewed sales cycle", async () => {
    mocks.getSalesCycleRows.mockResolvedValue([
      { key: null, isTotal: true, sampleSize: 10, meanDays: 39.8, medianDays: 16 },
    ]);
    grouping.buildDurationPoints.mockReturnValue([]);

    const result = await new PrismaWidgetCalculatorRepo().calculateWidgetData(
      widget(EntityType.deal, AggregationType.salesCycleDays),
    );

    expect(result.dataSummary).toEqual({ headline: 39.8, median: 16, sampleSize: 10 });
  });

  it("reads stage durations from the stage-history query, not from the deal query", async () => {
    mocks.getStageDurationRows.mockResolvedValue([
      { key: null, isTotal: true, sampleSize: 4, meanDays: 6, medianDays: 5 },
    ]);
    grouping.buildDurationPoints.mockReturnValue([]);

    const result = await new PrismaWidgetCalculatorRepo().calculateWidgetData(
      widget(EntityType.deal, AggregationType.stageDurationDays),
    );

    expect(mocks.getSalesCycleRows).not.toHaveBeenCalled();
    expect(result.dataSummary).toEqual({ headline: 6, median: 5, sampleSize: 4 });
  });

  it("has no summary when the period contains no completed durations", async () => {
    mocks.getStageDurationRows.mockResolvedValue([]);
    grouping.buildDurationPoints.mockReturnValue([]);

    const result = await new PrismaWidgetCalculatorRepo().calculateWidgetData(
      widget(EntityType.deal, AggregationType.stageDurationDays),
    );

    expect(result.dataSummary).toBeNull();
  });
});
