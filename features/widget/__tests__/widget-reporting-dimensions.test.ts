import { describe, expect, it } from "vitest";

import { AggregationType, WidgetGroupByType } from "@/generated/prisma";

import {
  DEAL_DIMENSION_GROUP_BY_TYPES,
  groupsClosedDealsByForecastMonth,
  groupsClosedDealsByLostOutcome,
  isDealDimensionGrouping,
  isForecastGrouping,
  isLostOutcomeGrouping,
  isMonthGrouping,
  isPipelinePositionGrouping,
  isUnsupportedClosedDealGrouping,
  requiresRawDimensionQuery,
  usesPeriodWindow,
} from "../widget-aggregation";

const NON_DEAL_GROUPINGS = [
  WidgetGroupByType.contact,
  WidgetGroupByType.organization,
  WidgetGroupByType.deal,
  WidgetGroupByType.service,
  WidgetGroupByType.customColumn,
  WidgetGroupByType.none,
];

describe("deal reporting dimensions", () => {
  it("covers every group-by the database resolves for a deal and nothing else", () => {
    for (const dimension of DEAL_DIMENSION_GROUP_BY_TYPES) expect(isDealDimensionGrouping(dimension)).toBe(true);
    for (const grouping of NON_DEAL_GROUPINGS) expect(isDealDimensionGrouping(grouping)).toBe(false);
  });

  it("keeps every dimension a widget filter can reach on the typed aggregate", () => {
    expect(requiresRawDimensionQuery(WidgetGroupByType.dealStage)).toBe(false);
    expect(requiresRawDimensionQuery(WidgetGroupByType.dealPipeline)).toBe(false);
    expect(requiresRawDimensionQuery(WidgetGroupByType.dealOwner)).toBe(false);
  });

  it("sends only the dimensions the database itself has to bound to raw SQL", () => {
    expect(requiresRawDimensionQuery(WidgetGroupByType.dealLostReason)).toBe(true);
    expect(requiresRawDimensionQuery(WidgetGroupByType.dealStageLostAt)).toBe(true);
    expect(requiresRawDimensionQuery(WidgetGroupByType.dealCloseMonth)).toBe(true);
    expect(requiresRawDimensionQuery(WidgetGroupByType.dealExpectedCloseMonth)).toBe(true);
  });

  it("names the two calendar dimensions and only the forward-looking one as a forecast", () => {
    expect(isMonthGrouping(WidgetGroupByType.dealCloseMonth)).toBe(true);
    expect(isMonthGrouping(WidgetGroupByType.dealExpectedCloseMonth)).toBe(true);
    expect(isMonthGrouping(WidgetGroupByType.dealStage)).toBe(false);

    expect(isForecastGrouping(WidgetGroupByType.dealExpectedCloseMonth)).toBe(true);
    expect(isForecastGrouping(WidgetGroupByType.dealCloseMonth)).toBe(false);
  });

  it("treats the lost reason and the stage lost at as dimensions no won deal can carry", () => {
    expect(isLostOutcomeGrouping(WidgetGroupByType.dealLostReason)).toBe(true);
    expect(isLostOutcomeGrouping(WidgetGroupByType.dealStageLostAt)).toBe(true);
    expect(isLostOutcomeGrouping(WidgetGroupByType.dealOwner)).toBe(false);
  });

  it("blocks a closed-deal metric from every dimension that would read zero or empty by construction", () => {
    for (const aggregationType of [AggregationType.winRate, AggregationType.salesCycleDays]) {
      expect(groupsClosedDealsByLostOutcome(aggregationType, WidgetGroupByType.dealLostReason)).toBe(true);
      expect(groupsClosedDealsByLostOutcome(aggregationType, WidgetGroupByType.dealStageLostAt)).toBe(true);
      expect(groupsClosedDealsByForecastMonth(aggregationType, WidgetGroupByType.dealExpectedCloseMonth)).toBe(true);
      expect(isUnsupportedClosedDealGrouping(aggregationType, WidgetGroupByType.dealStage)).toBe(true);
      expect(isUnsupportedClosedDealGrouping(aggregationType, WidgetGroupByType.dealOwner)).toBe(false);
      expect(isUnsupportedClosedDealGrouping(aggregationType, WidgetGroupByType.dealCloseMonth)).toBe(false);
    }
  });

  it("leaves an open-deal count free to use the lost-only dimensions, which is how a loss report is built", () => {
    for (const dimension of DEAL_DIMENSION_GROUP_BY_TYPES)
      expect(isUnsupportedClosedDealGrouping(AggregationType.count, dimension)).toBe(false);
  });

  it("asks for a period picker whenever the metric or the grouping needs a bounded window", () => {
    expect(usesPeriodWindow(AggregationType.winRate, WidgetGroupByType.none)).toBe(true);
    expect(usesPeriodWindow(AggregationType.salesCycleDays, WidgetGroupByType.none)).toBe(true);
    expect(usesPeriodWindow(AggregationType.dealWeightedValue, WidgetGroupByType.dealExpectedCloseMonth)).toBe(true);
    expect(usesPeriodWindow(AggregationType.count, WidgetGroupByType.dealCloseMonth)).toBe(true);
    expect(usesPeriodWindow(AggregationType.count, WidgetGroupByType.dealLostReason)).toBe(true);
    expect(usesPeriodWindow(AggregationType.count, WidgetGroupByType.dealStageLostAt)).toBe(true);
    expect(usesPeriodWindow(AggregationType.dealValue, WidgetGroupByType.dealStage)).toBe(false);
    expect(usesPeriodWindow(AggregationType.dealValue, WidgetGroupByType.dealOwner)).toBe(false);
  });

  it("keeps the older pipeline-position predicate narrow, so duration metrics stay where their SQL works", () => {
    expect(isPipelinePositionGrouping(WidgetGroupByType.dealStage)).toBe(true);
    expect(isPipelinePositionGrouping(WidgetGroupByType.dealPipeline)).toBe(true);
    expect(isPipelinePositionGrouping(WidgetGroupByType.dealOwner)).toBe(false);
    expect(isPipelinePositionGrouping(WidgetGroupByType.dealCloseMonth)).toBe(false);
  });
});
