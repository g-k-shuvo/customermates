import type { DiagramDataPoint } from "../widget.schema";
import type {
  WidgetForCalculation,
  WidgetCalculation,
  PeriodWindow,
  PipelinePosition,
  WinRateRow,
} from "./widget-calculator.types";
import type { ClosedDealTotals } from "../widget-metrics";

import { AggregationType, EntityType, WidgetGroupByType } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { getWidgetGroupingService, getWidgetDataFetcher, getCustomColumnRepo } from "@/core/di";
import { WinRateBasis } from "../widget.schema";
import {
  isDealDimensionGrouping,
  isForecastGrouping,
  isMonthGrouping,
  isPipelinePositionGrouping,
  isUnsupportedClosedDealGrouping,
  requiresRawDimensionQuery,
} from "../widget-aggregation";
import { winRateForBasis } from "../widget-metrics";
import { forecastWindow, monthAlignedWindow, periodWindow } from "./widget-period";

export class PrismaWidgetCalculatorRepo extends BaseRepository {
  async calculateWidgetData(widget: WidgetForCalculation): Promise<WidgetCalculation> {
    const { aggregationType } = widget;

    let calculation: WidgetCalculation;

    switch (aggregationType) {
      case AggregationType.count:
        calculation = { data: await this.calculateCount(widget), dataSummary: null };
        break;
      case AggregationType.dealValue:
        calculation = { data: await this.calculateDealValue(widget), dataSummary: null };
        break;
      case AggregationType.dealQuantity:
        calculation = { data: await this.calculateDealQuantity(widget), dataSummary: null };
        break;
      case AggregationType.dealWeightedValue:
        calculation = { data: await this.calculateDealWeightedValue(widget), dataSummary: null };
        break;
      case AggregationType.winRate:
        calculation = await this.calculateWinRate(widget);
        break;
      case AggregationType.salesCycleDays:
      case AggregationType.stageDurationDays:
        calculation = await this.calculateDuration(widget);
        break;
    }

    return { data: this.orderPoints(widget, calculation.data), dataSummary: calculation.dataSummary };
  }

  private orderPoints(widget: WidgetForCalculation, data: DiagramDataPoint[]): DiagramDataPoint[] {
    if (isDealDimensionGrouping(widget.groupByType)) return data;

    return [...data].sort((a, b) => b.value - a.value);
  }

  private async positionsFor(groupByType: WidgetGroupByType): Promise<PipelinePosition[]> {
    if (groupByType === WidgetGroupByType.dealPipeline) return await getWidgetDataFetcher().getPipelinePositions();
    if (groupByType === WidgetGroupByType.dealOwner) return await getWidgetDataFetcher().getOwnerPositions();
    if (groupByType === WidgetGroupByType.dealLostReason) return await getWidgetDataFetcher().getLostReasonPositions();

    return await getWidgetDataFetcher().getStagePositions();
  }

  private dimensionWindow(widget: WidgetForCalculation): PeriodWindow {
    const window = isForecastGrouping(widget.groupByType)
      ? forecastWindow(widget.aggregationType, widget.periodDays, new Date())
      : periodWindow(widget.aggregationType, widget.periodDays, new Date());

    return isMonthGrouping(widget.groupByType) ? monthAlignedWindow(window) : window;
  }

  private async calculateDealDimensionGroup(widget: WidgetForCalculation): Promise<DiagramDataPoint[]> {
    const grouping = getWidgetGroupingService();

    if (requiresRawDimensionQuery(widget.groupByType)) {
      const aggregates = await getWidgetDataFetcher().getDealDimensionAggregates(
        widget.groupByType,
        this.dimensionWindow(widget),
      );

      if (isMonthGrouping(widget.groupByType)) return grouping.buildMonthPoints(aggregates, widget.aggregationType);

      return grouping.buildPipelinePositionPoints(
        aggregates,
        await this.positionsFor(widget.groupByType),
        widget.aggregationType,
      );
    }

    const [aggregates, positions] = await Promise.all([
      getWidgetDataFetcher().groupDealsByDealDimension(widget, widget.groupByType),
      this.positionsFor(widget.groupByType),
    ]);

    return grouping.buildPipelinePositionPoints(aggregates, positions, widget.aggregationType);
  }

  private withSupportedGrouping(widget: WidgetForCalculation): WidgetForCalculation {
    if (!isUnsupportedClosedDealGrouping(widget.aggregationType, widget.groupByType)) return widget;

    return { ...widget, groupByType: WidgetGroupByType.none };
  }

  private addUpWinRateRows(rows: WinRateRow[]): ClosedDealTotals {
    return rows.reduce<ClosedDealTotals>(
      (accumulated, row) => ({
        wonCount: accumulated.wonCount + row.wonCount,
        lostCount: accumulated.lostCount + row.lostCount,
        wonValue: accumulated.wonValue + row.wonValue,
        lostValue: accumulated.lostValue + row.lostValue,
      }),
      { wonCount: 0, lostCount: 0, wonValue: 0, lostValue: 0 },
    );
  }

  private async calculateWinRate(unsafeWidget: WidgetForCalculation): Promise<WidgetCalculation> {
    const widget = this.withSupportedGrouping(unsafeWidget);
    const grouped = isDealDimensionGrouping(widget.groupByType);
    const basis = widget.displayOptions?.winRateBasis ?? WinRateBasis.count;
    const groupsByMonth = isMonthGrouping(widget.groupByType);
    const window = this.dimensionWindow(widget);
    const fetcher = getWidgetDataFetcher();
    const [rows, ungrouped, positions] = await Promise.all([
      fetcher.getWinRateRows(widget, window),
      grouped ? fetcher.getWinRateTotals(widget, window) : Promise.resolve(null),
      grouped && !groupsByMonth ? this.positionsFor(widget.groupByType) : Promise.resolve([]),
    ]);

    const totals = ungrouped ?? this.addUpWinRateRows(rows);

    return {
      data: groupsByMonth
        ? getWidgetGroupingService().buildMonthWinRatePoints(rows, basis)
        : getWidgetGroupingService().buildWinRatePoints(rows, positions, grouped, basis),
      dataSummary: {
        headline: winRateForBasis(totals, basis),
        median: null,
        sampleSize: totals.wonCount + totals.lostCount,
      },
    };
  }

  private async calculateDuration(unsafeWidget: WidgetForCalculation): Promise<WidgetCalculation> {
    const widget = this.withSupportedGrouping(unsafeWidget);
    const grouped = isPipelinePositionGrouping(widget.groupByType);
    const window = periodWindow(widget.aggregationType, widget.periodDays, new Date());
    const fetcher = getWidgetDataFetcher();
    const [rows, positions] = await Promise.all([
      widget.aggregationType === AggregationType.salesCycleDays
        ? fetcher.getSalesCycleRows(widget, window)
        : fetcher.getStageDurationRows(widget, window),
      grouped ? this.positionsFor(widget.groupByType) : Promise.resolve([]),
    ]);

    const overall = rows.find((row) => row.isTotal);

    return {
      data: getWidgetGroupingService().buildDurationPoints(rows, positions, grouped),
      dataSummary: overall
        ? { headline: overall.meanDays, median: overall.medianDays, sampleSize: overall.sampleSize }
        : null,
    };
  }

  private async calculateCount(widget: WidgetForCalculation): Promise<DiagramDataPoint[]> {
    const { entityType, entityFilters, groupByType, groupByCustomColumnId } = widget;

    if (groupByType === WidgetGroupByType.none) {
      return [
        {
          labelKind: "system",
          systemLabelKey: "total",
          value: await getWidgetDataFetcher().getEntityCount(entityType, entityFilters),
        },
      ];
    }

    if (isDealDimensionGrouping(groupByType)) return await this.calculateDealDimensionGroup(widget);

    if (groupByType === WidgetGroupByType.customColumn && groupByCustomColumnId) {
      const customColumn = await getCustomColumnRepo().findById(groupByCustomColumnId);
      if (!customColumn || customColumn.type !== "singleSelect") return [];

      const counts = await getWidgetDataFetcher().countByCustomColumn(entityType, entityFilters, customColumn);
      return getWidgetGroupingService().buildCustomColumnPoints(counts, customColumn);
    }

    const entities = await getWidgetDataFetcher().getEntitiesForGrouping(entityType, entityFilters);
    return getWidgetGroupingService().groupEntitiesByEntityType(entities, entityType);
  }

  private async calculateDealValue(widget: WidgetForCalculation): Promise<DiagramDataPoint[]> {
    const { entityType, groupByType, groupByCustomColumnId } = widget;

    if (groupByType === WidgetGroupByType.none) {
      if (entityType === EntityType.service) {
        const deals = await getWidgetDataFetcher().getDealsForEntityType(widget);
        const totalValue = deals.reduce(
          (sum, deal) => sum + (deal.services ?? []).reduce((s, sd) => s + sd.service.amount * sd.quantity, 0),
          0,
        );
        return [{ labelKind: "system", systemLabelKey: "total", value: totalValue }];
      }

      return [
        {
          labelKind: "system",
          systemLabelKey: "total",
          value: await getWidgetDataFetcher().sumDealField(widget, "totalValue"),
        },
      ];
    }

    if (isDealDimensionGrouping(groupByType)) return await this.calculateDealDimensionGroup(widget);

    const deals = await getWidgetDataFetcher().getDealsForEntityType(widget);

    if (groupByType === WidgetGroupByType.customColumn && groupByCustomColumnId)
      return await getWidgetGroupingService().groupDealsByCustomColumn(widget, deals);

    return getWidgetGroupingService().groupDealsByEntityType(widget, deals);
  }

  private async calculateDealWeightedValue(widget: WidgetForCalculation): Promise<DiagramDataPoint[]> {
    const { entityType, groupByType, groupByCustomColumnId } = widget;

    if (entityType === EntityType.service || entityType === EntityType.task) return [];

    if (groupByType === WidgetGroupByType.none) {
      return [
        {
          labelKind: "system",
          systemLabelKey: "total",
          value: await getWidgetDataFetcher().sumDealField(widget, "weightedValue"),
        },
      ];
    }

    if (isDealDimensionGrouping(groupByType)) return await this.calculateDealDimensionGroup(widget);

    const deals = await getWidgetDataFetcher().getDealsForEntityType(widget);

    if (groupByType === WidgetGroupByType.customColumn && groupByCustomColumnId)
      return await getWidgetGroupingService().groupDealsByCustomColumn(widget, deals);

    return getWidgetGroupingService().groupDealsByEntityType(widget, deals);
  }

  private async calculateDealQuantity(widget: WidgetForCalculation): Promise<DiagramDataPoint[]> {
    const { entityType, groupByType, groupByCustomColumnId } = widget;

    if (entityType !== EntityType.service) return [];

    if (groupByType === WidgetGroupByType.none) {
      return [
        {
          labelKind: "system",
          systemLabelKey: "total",
          value: await getWidgetDataFetcher().sumDealField(widget, "totalQuantity"),
        },
      ];
    }

    if (isDealDimensionGrouping(groupByType)) return await this.calculateDealDimensionGroup(widget);

    if (groupByType === WidgetGroupByType.service) {
      return getWidgetGroupingService().groupDealsByEntityType(
        widget,
        await getWidgetDataFetcher().getDealsForEntityType(widget),
      );
    }

    if (groupByType === WidgetGroupByType.customColumn && groupByCustomColumnId) {
      return await getWidgetGroupingService().groupDealsByCustomColumn(
        widget,
        await getWidgetDataFetcher().getDealsForEntityType(widget),
      );
    }

    return [];
  }
}
