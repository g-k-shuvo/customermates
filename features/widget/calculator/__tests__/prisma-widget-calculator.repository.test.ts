import { beforeEach, describe, expect, it, vi } from "vitest";

import { AggregationType, EntityType, WidgetGroupByType } from "@/generated/prisma";

const mocks = vi.hoisted(() => ({
  countByCustomColumn: vi.fn(),
  getDealsForEntityType: vi.fn(),
  getEntitiesForGrouping: vi.fn(),
  getEntityCount: vi.fn(),
  sumDealField: vi.fn(),
  groupDealsByDealDimension: vi.fn(),
  getDealDimensionAggregates: vi.fn(),
  getStagePositions: vi.fn(),
  getPipelinePositions: vi.fn(),
  getOwnerPositions: vi.fn(),
  getLostReasonPositions: vi.fn(),
  getWinRateRows: vi.fn(),
  getWinRateTotals: vi.fn(),
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
  buildMonthWinRatePoints: vi.fn(),
  buildMonthPoints: vi.fn(),
  buildDurationPoints: vi.fn(),
}));

vi.mock("@/core/di", () => ({
  getCustomColumnRepo: () => ({ findById: vi.fn() }),
  getWidgetDataFetcher: () => mocks,
  getWidgetGroupingService: () => grouping,
}));

import { PrismaWidgetCalculatorRepo } from "../prisma-widget-calculator.repository";
import { DisplayType, WinRateBasis } from "../../widget.schema";

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
    displayOptions: null,
  };
}

const MILLISECONDS_PER_DAY = 86_400_000;

function isUtcMonthStart(date: Date): boolean {
  return (
    date.getUTCDate() === 1 &&
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  );
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
    mocks.groupDealsByDealDimension.mockResolvedValue([]);
    mocks.getStagePositions.mockResolvedValue([]);
    grouping.buildPipelinePositionPoints.mockReturnValue(ASCENDING_STAGE_POINTS);

    const result = await new PrismaWidgetCalculatorRepo().calculateWidgetData(
      widget(EntityType.deal, AggregationType.count, WidgetGroupByType.dealStage),
    );

    expect(result.data.map((point) => point.value)).toEqual([1, 4, 9]);
  });

  it("keeps pipeline-grouped points in pipeline order and asks for pipelines, not stages", async () => {
    mocks.groupDealsByDealDimension.mockResolvedValue([]);
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
    mocks.getWinRateTotals.mockResolvedValue({ key: null, wonCount: 0, lostCount: 0, wonValue: 0, lostValue: 0 });
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

describe("PrismaWidgetCalculatorRepo reporting dimensions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("labels a win rate grouped by owner from the company roster", async () => {
    mocks.getWinRateRows.mockResolvedValue([]);
    mocks.getWinRateTotals.mockResolvedValue({ key: null, wonCount: 0, lostCount: 0, wonValue: 0, lostValue: 0 });
    mocks.getOwnerPositions.mockResolvedValue([{ id: "user-a", name: "Ann", position: 0 }]);
    grouping.buildWinRatePoints.mockReturnValue([]);

    await new PrismaWidgetCalculatorRepo().calculateWidgetData(
      widget(EntityType.deal, AggregationType.winRate, WidgetGroupByType.dealOwner),
    );

    expect(mocks.getOwnerPositions).toHaveBeenCalled();
    expect(mocks.getWinRateRows.mock.calls[0][0].groupByType).toBe(WidgetGroupByType.dealOwner);
    expect(grouping.buildWinRatePoints.mock.calls[0][2]).toBe(true);
  });

  it("labels a lost-reason count from the configured reasons instead of the raw uuid", async () => {
    mocks.getDealDimensionAggregates.mockResolvedValue([]);
    mocks.getLostReasonPositions.mockResolvedValue([{ id: "reason-1", name: "Price", position: 0 }]);
    grouping.buildPipelinePositionPoints.mockReturnValue([]);

    await new PrismaWidgetCalculatorRepo().calculateWidgetData(
      widget(EntityType.deal, AggregationType.count, WidgetGroupByType.dealLostReason),
    );

    expect(mocks.getLostReasonPositions).toHaveBeenCalled();
    expect(mocks.groupDealsByDealDimension).not.toHaveBeenCalled();
  });

  it("plots calendar months as month points and asks for no label registry at all", async () => {
    mocks.getDealDimensionAggregates.mockResolvedValue([]);
    grouping.buildMonthPoints.mockReturnValue([]);

    await new PrismaWidgetCalculatorRepo().calculateWidgetData(
      widget(EntityType.deal, AggregationType.dealValue, WidgetGroupByType.dealCloseMonth),
    );

    expect(grouping.buildMonthPoints).toHaveBeenCalled();
    expect(mocks.getStagePositions).not.toHaveBeenCalled();
    expect(mocks.getPipelinePositions).not.toHaveBeenCalled();
  });

  it("plots a win rate by close month on the month builder rather than the position builder", async () => {
    mocks.getWinRateRows.mockResolvedValue([]);
    mocks.getWinRateTotals.mockResolvedValue({ key: null, wonCount: 0, lostCount: 0, wonValue: 0, lostValue: 0 });
    grouping.buildMonthWinRatePoints.mockReturnValue([]);

    await new PrismaWidgetCalculatorRepo().calculateWidgetData(
      widget(EntityType.deal, AggregationType.winRate, WidgetGroupByType.dealCloseMonth),
    );

    expect(grouping.buildMonthWinRatePoints).toHaveBeenCalled();
    expect(grouping.buildWinRatePoints).not.toHaveBeenCalled();
  });

  it("looks forward for an expected close month and backward for everything else", async () => {
    mocks.getDealDimensionAggregates.mockResolvedValue([]);
    grouping.buildMonthPoints.mockReturnValue([]);
    const before = new Date();

    await new PrismaWidgetCalculatorRepo().calculateWidgetData(
      widget(EntityType.deal, AggregationType.dealWeightedValue, WidgetGroupByType.dealExpectedCloseMonth),
    );

    const forecast = mocks.getDealDimensionAggregates.mock.calls[0][1];
    expect(forecast.to.getTime()).toBeGreaterThan(before.getTime());

    await new PrismaWidgetCalculatorRepo().calculateWidgetData(
      widget(EntityType.deal, AggregationType.dealValue, WidgetGroupByType.dealCloseMonth),
    );

    const history = mocks.getDealDimensionAggregates.mock.calls[1][1];
    expect(history.from.getTime()).toBeLessThan(before.getTime() - MILLISECONDS_PER_DAY);
    expect(forecast.from.getTime()).toBeGreaterThan(history.from.getTime());
  });

  it("opens a month-grouped window on a calendar month, so no bar covers a part month", async () => {
    mocks.getDealDimensionAggregates.mockResolvedValue([]);
    grouping.buildMonthPoints.mockReturnValue([]);
    const before = new Date();

    await new PrismaWidgetCalculatorRepo().calculateWidgetData(
      widget(EntityType.deal, AggregationType.dealWeightedValue, WidgetGroupByType.dealExpectedCloseMonth),
    );

    await new PrismaWidgetCalculatorRepo().calculateWidgetData(
      widget(EntityType.deal, AggregationType.dealValue, WidgetGroupByType.dealCloseMonth),
    );

    for (const [, window] of mocks.getDealDimensionAggregates.mock.calls) {
      expect(isUtcMonthStart(window.from)).toBe(true);
      expect(isUtcMonthStart(window.to)).toBe(true);
      expect(window.to.getTime()).toBeGreaterThan(before.getTime());
    }
  });

  it("starts the forecast at the month in progress, so a deal that has already slipped still counts", async () => {
    mocks.getDealDimensionAggregates.mockResolvedValue([]);
    grouping.buildMonthPoints.mockReturnValue([]);
    const before = new Date();

    await new PrismaWidgetCalculatorRepo().calculateWidgetData(
      widget(EntityType.deal, AggregationType.dealWeightedValue, WidgetGroupByType.dealExpectedCloseMonth),
    );

    const forecast = mocks.getDealDimensionAggregates.mock.calls[0][1];

    expect(forecast.from.getTime()).toBeLessThanOrEqual(before.getTime());
    expect(forecast.from).toEqual(new Date(Date.UTC(before.getUTCFullYear(), before.getUTCMonth(), 1)));
  });

  it("reads the headline of a grouped win rate from an ungrouped pass, not from the sum of the groups", async () => {
    mocks.getWinRateRows.mockResolvedValue([
      { key: "user-a", wonCount: 1, lostCount: 1, wonValue: 1000, lostValue: 1000 },
      { key: "user-b", wonCount: 1, lostCount: 0, wonValue: 1000, lostValue: 0 },
      { key: null, wonCount: 0, lostCount: 1, wonValue: 0, lostValue: 4000 },
    ]);
    mocks.getWinRateTotals.mockResolvedValue({ key: null, wonCount: 1, lostCount: 2, wonValue: 1000, lostValue: 5000 });
    mocks.getOwnerPositions.mockResolvedValue([]);
    grouping.buildWinRatePoints.mockReturnValue([]);

    const result = await new PrismaWidgetCalculatorRepo().calculateWidgetData(
      widget(EntityType.deal, AggregationType.winRate, WidgetGroupByType.dealOwner),
    );

    expect(result.dataSummary).toEqual({ headline: (1 / 3) * 100, median: null, sampleSize: 3 });
    expect(mocks.getWinRateTotals).toHaveBeenCalled();
  });

  it("asks for no second pass when nothing is grouped, where the single row is already the total", async () => {
    mocks.getWinRateRows.mockResolvedValue([{ key: null, wonCount: 1, lostCount: 1, wonValue: 1000, lostValue: 3000 }]);
    grouping.buildWinRatePoints.mockReturnValue([]);

    const result = await new PrismaWidgetCalculatorRepo().calculateWidgetData(
      widget(EntityType.deal, AggregationType.winRate),
    );

    expect(mocks.getWinRateTotals).not.toHaveBeenCalled();
    expect(result.dataSummary).toEqual({ headline: 50, median: null, sampleSize: 2 });
  });

  it("summarises the win rate by value when the widget is configured to read value", async () => {
    mocks.getWinRateRows.mockResolvedValue([{ key: null, wonCount: 1, lostCount: 3, wonValue: 9000, lostValue: 1000 }]);
    grouping.buildWinRatePoints.mockReturnValue([]);

    const byValue = await new PrismaWidgetCalculatorRepo().calculateWidgetData({
      ...widget(EntityType.deal, AggregationType.winRate),
      displayOptions: { displayType: DisplayType.verticalBarChart, winRateBasis: WinRateBasis.value },
    });

    expect(byValue.dataSummary).toEqual({ headline: 90, median: null, sampleSize: 4 });
    expect(grouping.buildWinRatePoints.mock.calls[0][3]).toBe(WinRateBasis.value);

    const byCount = await new PrismaWidgetCalculatorRepo().calculateWidgetData(
      widget(EntityType.deal, AggregationType.winRate),
    );

    expect(byCount.dataSummary).toEqual({ headline: 25, median: null, sampleSize: 4 });
    expect(grouping.buildWinRatePoints.mock.calls[1][3]).toBe(WinRateBasis.count);
  });

  it("keeps the sample size a deal count even when the rate is read by value", async () => {
    mocks.getWinRateRows.mockResolvedValue([{ key: null, wonCount: 1, lostCount: 3, wonValue: 9000, lostValue: 1000 }]);
    grouping.buildWinRatePoints.mockReturnValue([]);

    const result = await new PrismaWidgetCalculatorRepo().calculateWidgetData({
      ...widget(EntityType.deal, AggregationType.winRate),
      displayOptions: { displayType: DisplayType.verticalBarChart, winRateBasis: WinRateBasis.value },
    });

    expect(result.dataSummary?.sampleSize).toBe(4);
  });
});
