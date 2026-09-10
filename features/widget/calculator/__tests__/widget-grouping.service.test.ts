import { describe, expect, it } from "vitest";

import { AggregationType, EntityType, WidgetGroupByType } from "@/generated/prisma";

import { WidgetGroupingService } from "../widget-grouping.service";
import { WinRateBasis } from "../../widget.schema";

const service = new WidgetGroupingService();

function widget(groupByType: WidgetGroupByType) {
  return {
    aggregationType: AggregationType.dealValue,
    dealFilters: [],
    entityFilters: [],
    entityType: EntityType.deal,
    groupByCustomColumnId: null,
    groupByType,
    periodDays: null,
    displayOptions: null,
  };
}

const STAGE_POSITIONS = [
  { id: "stage-lead", name: "Lead in", position: 0, pipelineId: "pipeline-1", pipelinePosition: 0 },
  { id: "stage-demo", name: "Demo", position: 1, pipelineId: "pipeline-1", pipelinePosition: 0 },
  { id: "stage-won", name: "Won", position: 2, pipelineId: "pipeline-1", pipelinePosition: 0 },
];

describe("WidgetGroupingService semantic labels", () => {
  it.each([WidgetGroupByType.contact, WidgetGroupByType.organization])(
    "returns a system no-group point for an unassigned %s grouping",
    (groupByType) => {
      const points = service.groupDealsByEntityType(widget(groupByType), [
        { id: "deal-1", name: "Deal", totalQuantity: 1, totalValue: 42, weightedValue: null },
      ]);

      expect(points).toEqual([{ labelKind: "system", systemLabelKey: "noGroup", value: 42 }]);
    },
  );

  it("returns a system no-group point for a missing custom-column value", () => {
    const points = service.buildCustomColumnPoints([{ value: null, count: 3 }], {
      type: "singleSelect",
      options: { options: [] },
    });

    expect(points).toEqual([{ labelKind: "system", systemLabelKey: "noGroup", value: 3 }]);
  });

  it("preserves user labels that collide with former English sentinel text", () => {
    const points = service.buildCustomColumnPoints(
      [
        { value: "total", count: 2 },
        { value: "no-group", count: 1 },
      ],
      {
        type: "singleSelect",
        options: {
          options: [
            { color: "default", label: "Total", value: "total" },
            { color: "secondary", label: "no-group", value: "no-group" },
          ],
        },
      },
    );

    expect(points).toEqual([
      { labelKind: "literal", label: "Total", optionColor: "default", value: 2 },
      { labelKind: "literal", label: "no-group", optionColor: "secondary", value: 1 },
    ]);
  });
});

describe("WidgetGroupingService pipeline-stage ordering", () => {
  it("emits stages in pipeline position order even when the values are ascending", () => {
    const points = service.buildPipelinePositionPoints(
      [
        { key: "stage-won", count: 9, totalValue: 900, totalQuantity: 0, weightedValue: 0 },
        { key: "stage-lead", count: 1, totalValue: 100, totalQuantity: 0, weightedValue: 0 },
        { key: "stage-demo", count: 4, totalValue: 400, totalQuantity: 0, weightedValue: 0 },
      ],
      STAGE_POSITIONS,
      AggregationType.count,
    );

    expect(points.map((point) => point.value)).toEqual([1, 4, 9]);
  });

  it("collects deals whose stage is gone into a single system group at the end", () => {
    const points = service.buildPipelinePositionPoints(
      [
        { key: "stage-demo", count: 4, totalValue: 400, totalQuantity: 0, weightedValue: 0 },
        { key: null, count: 2, totalValue: 200, totalQuantity: 0, weightedValue: 0 },
        { key: "stage-deleted", count: 1, totalValue: 100, totalQuantity: 0, weightedValue: 0 },
      ],
      STAGE_POSITIONS,
      AggregationType.dealValue,
    );

    expect(points).toEqual([
      { labelKind: "literal", label: "Demo", value: 400 },
      { labelKind: "system", systemLabelKey: "noGroup", value: 300 },
    ]);
  });
});

describe("WidgetGroupingService win rate points", () => {
  it("rates each stage on closed deals only and carries the closed counts", () => {
    const points = service.buildWinRatePoints(
      [
        { key: "stage-lead", wonCount: 3, lostCount: 1, wonValue: 3000, lostValue: 1000 },
        { key: "stage-demo", wonCount: 0, lostCount: 0, wonValue: 0, lostValue: 0 },
      ],
      STAGE_POSITIONS,
      true,
    );

    expect(points).toEqual([
      {
        labelKind: "literal",
        label: "Lead in",
        value: 75,
        metrics: { wonCount: 3, lostCount: 1, wonValue: 3000, lostValue: 1000, sampleSize: 4 },
      },
      {
        labelKind: "literal",
        label: "Demo",
        value: 0,
        metrics: { wonCount: 0, lostCount: 0, wonValue: 0, lostValue: 0, sampleSize: 0 },
      },
    ]);
  });

  it("keeps closed deals nobody was assigned to in a single system group at the end", () => {
    const points = service.buildWinRatePoints(
      [
        { key: "user-a", wonCount: 3, lostCount: 1, wonValue: 3000, lostValue: 1000 },
        { key: null, wonCount: 1, lostCount: 1, wonValue: 500, lostValue: 500 },
      ],
      [{ id: "user-a", name: "Ann", position: 0 }],
      true,
    );

    expect(points).toEqual([
      {
        labelKind: "literal",
        label: "Ann",
        value: 75,
        metrics: { wonCount: 3, lostCount: 1, wonValue: 3000, lostValue: 1000, sampleSize: 4 },
      },
      {
        labelKind: "system",
        systemLabelKey: "noGroup",
        value: 50,
        metrics: { wonCount: 1, lostCount: 1, wonValue: 500, lostValue: 500, sampleSize: 2 },
      },
    ]);
  });

  it("labels an ungrouped win rate as the period total", () => {
    const points = service.buildWinRatePoints(
      [{ key: null, wonCount: 1, lostCount: 3, wonValue: 1000, lostValue: 3000 }],
      [],
      false,
    );

    expect(points[0]).toMatchObject({ labelKind: "system", systemLabelKey: "total", value: 25 });
  });
});

describe("WidgetGroupingService duration points", () => {
  it("reports the median beside the mean for every stage", () => {
    const points = service.buildDurationPoints(
      [
        { key: null, isTotal: true, sampleSize: 20, meanDays: 39.8, medianDays: 16 },
        { key: "stage-lead", isTotal: false, sampleSize: 10, meanDays: 39.8, medianDays: 16 },
        { key: "stage-demo", isTotal: false, sampleSize: 10, meanDays: 6, medianDays: 5 },
      ],
      STAGE_POSITIONS,
      true,
    );

    expect(points).toEqual([
      { labelKind: "literal", label: "Lead in", value: 39.8, metrics: { mean: 39.8, median: 16, sampleSize: 10 } },
      { labelKind: "literal", label: "Demo", value: 6, metrics: { mean: 6, median: 5, sampleSize: 10 } },
    ]);
  });

  it("drops stages nothing passed through in the period", () => {
    const points = service.buildDurationPoints(
      [{ key: "stage-lead", isTotal: false, sampleSize: 0, meanDays: null, medianDays: null }],
      STAGE_POSITIONS,
      true,
    );

    expect(points).toEqual([]);
  });
});

describe("WidgetGroupingService calendar month points", () => {
  const AGGREGATES = [
    { key: "2026-03", count: 3, totalValue: 300, totalQuantity: 0, weightedValue: 150 },
    { key: "2026-01", count: 1, totalValue: 100, totalQuantity: 0, weightedValue: 50 },
    { key: "2026-02", count: 2, totalValue: 200, totalQuantity: 0, weightedValue: 100 },
  ];

  it("plots months in calendar order, not in the order the database returned them", () => {
    const points = service.buildMonthPoints(AGGREGATES, AggregationType.dealValue);

    expect(points).toEqual([
      { labelKind: "month", month: "2026-01", value: 100 },
      { labelKind: "month", month: "2026-02", value: 200 },
      { labelKind: "month", month: "2026-03", value: 300 },
    ]);
  });

  it("keeps a month bucket out of the chart when the group key is not a month at all", () => {
    const points = service.buildMonthPoints(
      [...AGGREGATES, { key: null, count: 9, totalValue: 900, totalQuantity: 0, weightedValue: 0 }],
      AggregationType.dealValue,
    );

    expect(points).toHaveLength(3);
  });

  it("reads the weighted forecast from the weighted column", () => {
    const points = service.buildMonthPoints(AGGREGATES, AggregationType.dealWeightedValue);

    expect(points.map((point) => point.value)).toEqual([50, 100, 150]);
  });

  it("orders a month-grouped win rate chronologically and carries both bases in the metrics", () => {
    const rows = [
      { key: "2026-02", wonCount: 1, lostCount: 1, wonValue: 9000, lostValue: 1000 },
      { key: "2026-01", wonCount: 3, lostCount: 1, wonValue: 1000, lostValue: 3000 },
    ];

    expect(service.buildMonthWinRatePoints(rows)).toEqual([
      {
        labelKind: "month",
        month: "2026-01",
        value: 75,
        metrics: { wonCount: 3, lostCount: 1, wonValue: 1000, lostValue: 3000, sampleSize: 4 },
      },
      {
        labelKind: "month",
        month: "2026-02",
        value: 50,
        metrics: { wonCount: 1, lostCount: 1, wonValue: 9000, lostValue: 1000, sampleSize: 2 },
      },
    ]);

    expect(service.buildMonthWinRatePoints(rows, WinRateBasis.value).map((point) => point.value)).toEqual([25, 90]);
  });
});

describe("WidgetGroupingService win rate basis", () => {
  const ROWS = [{ key: "user-a", wonCount: 1, lostCount: 3, wonValue: 9000, lostValue: 1000 }];
  const POSITIONS = [{ id: "user-a", name: "Ann", position: 0 }];

  it("plots the share of closed deals by default and the share of closed value on request", () => {
    expect(service.buildWinRatePoints(ROWS, POSITIONS, true)[0].value).toBe(25);
    expect(service.buildWinRatePoints(ROWS, POSITIONS, true, WinRateBasis.value)[0].value).toBe(90);
  });

  it("uses the same basis for the ungrouped total", () => {
    expect(service.buildWinRatePoints(ROWS, [], false)[0].value).toBe(25);
    expect(service.buildWinRatePoints(ROWS, [], false, WinRateBasis.value)[0].value).toBe(90);
  });

  it("reports no rate rather than zero when a group closed nothing", () => {
    const empty = [{ key: "user-a", wonCount: 0, lostCount: 0, wonValue: 0, lostValue: 0 }];

    expect(service.buildWinRatePoints(empty, POSITIONS, true)[0].value).toBe(0);
    expect(service.buildWinRatePoints(empty, POSITIONS, true)[0].metrics?.sampleSize).toBe(0);
  });
});
