import { AggregationType, WidgetGroupByType } from "@/generated/prisma";

export const WIDGET_PERIOD_DAY_OPTIONS = [30, 90, 180, 365, 730] as const;

export const WIDGET_PERIOD_DAYS_MAX = 3650;

const DEFAULT_PERIOD_DAYS: Partial<Record<AggregationType, number>> = {
  [AggregationType.winRate]: 90,
  [AggregationType.stageDurationDays]: 90,
  [AggregationType.salesCycleDays]: 365,
};

export function isCurrencyAggregation(aggregationType: AggregationType | undefined): boolean {
  return aggregationType === AggregationType.dealValue || aggregationType === AggregationType.dealWeightedValue;
}

export function isRateAggregation(aggregationType: AggregationType | undefined): boolean {
  return aggregationType === AggregationType.winRate;
}

export function isDurationAggregation(aggregationType: AggregationType | undefined): boolean {
  return aggregationType === AggregationType.salesCycleDays || aggregationType === AggregationType.stageDurationDays;
}

export function isPeriodAggregation(aggregationType: AggregationType | undefined): boolean {
  return isRateAggregation(aggregationType) || isDurationAggregation(aggregationType);
}

export function defaultPeriodDays(aggregationType: AggregationType): number | null {
  return DEFAULT_PERIOD_DAYS[aggregationType] ?? null;
}

export function resolvePeriodDays(aggregationType: AggregationType, periodDays: number | null | undefined): number {
  if (periodDays && periodDays > 0) return Math.min(periodDays, WIDGET_PERIOD_DAYS_MAX);
  return defaultPeriodDays(aggregationType) ?? 90;
}

export const WIDGET_FUNNEL_DEFAULT_PERIOD_DAYS = 90;

export function resolveFunnelPeriodDays(periodDays: number | null | undefined): number {
  if (periodDays && periodDays > 0) return Math.min(periodDays, WIDGET_PERIOD_DAYS_MAX);

  return WIDGET_FUNNEL_DEFAULT_PERIOD_DAYS;
}

export function isPipelinePositionGrouping(groupByType: WidgetGroupByType): boolean {
  return groupByType === WidgetGroupByType.dealStage || groupByType === WidgetGroupByType.dealPipeline;
}

export const DEAL_DIMENSION_GROUP_BY_TYPES = [
  WidgetGroupByType.dealStage,
  WidgetGroupByType.dealPipeline,
  WidgetGroupByType.dealOwner,
  WidgetGroupByType.dealLostReason,
  WidgetGroupByType.dealStageLostAt,
  WidgetGroupByType.dealCloseMonth,
  WidgetGroupByType.dealExpectedCloseMonth,
] as const;

const DEAL_DIMENSIONS = new Set<WidgetGroupByType>(DEAL_DIMENSION_GROUP_BY_TYPES);

export function isDealDimensionGrouping(groupByType: WidgetGroupByType | undefined): boolean {
  return groupByType !== undefined && DEAL_DIMENSIONS.has(groupByType);
}

export function isMonthGrouping(groupByType: WidgetGroupByType | undefined): boolean {
  return groupByType === WidgetGroupByType.dealCloseMonth || groupByType === WidgetGroupByType.dealExpectedCloseMonth;
}

export function isForecastGrouping(groupByType: WidgetGroupByType | undefined): boolean {
  return groupByType === WidgetGroupByType.dealExpectedCloseMonth;
}

export function isLostOutcomeGrouping(groupByType: WidgetGroupByType | undefined): boolean {
  return groupByType === WidgetGroupByType.dealLostReason || groupByType === WidgetGroupByType.dealStageLostAt;
}

export function requiresRawDimensionQuery(groupByType: WidgetGroupByType | undefined): boolean {
  return isLostOutcomeGrouping(groupByType) || isMonthGrouping(groupByType);
}

export function isClosedDealAggregation(aggregationType: AggregationType | undefined): boolean {
  return aggregationType === AggregationType.winRate || aggregationType === AggregationType.salesCycleDays;
}

export function groupsClosedDealsByCurrentStage(
  aggregationType: AggregationType | undefined,
  groupByType: WidgetGroupByType | undefined,
): boolean {
  return isClosedDealAggregation(aggregationType) && groupByType === WidgetGroupByType.dealStage;
}

export function groupsClosedDealsByLostOutcome(
  aggregationType: AggregationType | undefined,
  groupByType: WidgetGroupByType | undefined,
): boolean {
  return isClosedDealAggregation(aggregationType) && isLostOutcomeGrouping(groupByType);
}

export function groupsClosedDealsByForecastMonth(
  aggregationType: AggregationType | undefined,
  groupByType: WidgetGroupByType | undefined,
): boolean {
  return isClosedDealAggregation(aggregationType) && isForecastGrouping(groupByType);
}

export function isUnsupportedClosedDealGrouping(
  aggregationType: AggregationType | undefined,
  groupByType: WidgetGroupByType | undefined,
): boolean {
  return (
    groupsClosedDealsByCurrentStage(aggregationType, groupByType) ||
    groupsClosedDealsByLostOutcome(aggregationType, groupByType) ||
    groupsClosedDealsByForecastMonth(aggregationType, groupByType)
  );
}

export function usesPeriodWindow(
  aggregationType: AggregationType | undefined,
  groupByType: WidgetGroupByType | undefined,
): boolean {
  return isPeriodAggregation(aggregationType) || isMonthGrouping(groupByType) || isLostOutcomeGrouping(groupByType);
}
