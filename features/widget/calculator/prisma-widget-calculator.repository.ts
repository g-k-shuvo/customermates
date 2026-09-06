import type { DiagramDataPoint } from "../widget.schema";
import type { WidgetForCalculation, WidgetCalculation, PipelinePosition } from "./widget-calculator.types";

import { AggregationType, EntityType, WidgetGroupByType } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { getWidgetGroupingService, getWidgetDataFetcher, getCustomColumnRepo } from "@/core/di";
import { groupsClosedDealsByCurrentStage, isPipelinePositionGrouping } from "../widget-aggregation";
import { winRatePercent } from "../widget-metrics";
import { periodWindow } from "./widget-period";

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
    if (isPipelinePositionGrouping(widget.groupByType)) return data;

    return [...data].sort((a, b) => b.value - a.value);
  }

  private async positionsFor(groupByType: WidgetGroupByType): Promise<PipelinePosition[]> {
    return groupByType === WidgetGroupByType.dealPipeline
      ? await getWidgetDataFetcher().getPipelinePositions()
      : await getWidgetDataFetcher().getStagePositions();
  }

  private async calculatePipelinePositionGroup(widget: WidgetForCalculation): Promise<DiagramDataPoint[]> {
    const [aggregates, positions] = await Promise.all([
      getWidgetDataFetcher().groupDealsByPipelinePosition(widget, widget.groupByType),
      this.positionsFor(widget.groupByType),
    ]);

    return getWidgetGroupingService().buildPipelinePositionPoints(aggregates, positions, widget.aggregationType);
  }

  private withSupportedGrouping(widget: WidgetForCalculation): WidgetForCalculation {
    if (!groupsClosedDealsByCurrentStage(widget.aggregationType, widget.groupByType)) return widget;

    return { ...widget, groupByType: WidgetGroupByType.none };
  }

  private async calculateWinRate(unsafeWidget: WidgetForCalculation): Promise<WidgetCalculation> {
    const widget = this.withSupportedGrouping(unsafeWidget);
    const grouped = isPipelinePositionGrouping(widget.groupByType);
    const window = periodWindow(widget.aggregationType, widget.periodDays, new Date());
    const [rows, positions] = await Promise.all([
      getWidgetDataFetcher().getWinRateRows(widget, window),
      grouped ? this.positionsFor(widget.groupByType) : Promise.resolve([]),
    ]);

    const wonCount = rows.reduce((sum, row) => sum + row.wonCount, 0);
    const lostCount = rows.reduce((sum, row) => sum + row.lostCount, 0);

    return {
      data: getWidgetGroupingService().buildWinRatePoints(rows, positions, grouped),
      dataSummary: {
        headline: winRatePercent(wonCount, lostCount),
        median: null,
        sampleSize: wonCount + lostCount,
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

    if (isPipelinePositionGrouping(groupByType)) return await this.calculatePipelinePositionGroup(widget);

    if (groupByType === WidgetGroupByType.customColumn && groupByCustomColumnId) {
      const customColumn = await getCustomColumnRepo().findById(groupByCustomColumnId);
      if (!customColumn || customColumn.type !== "singleSelect") return [];

      const counts = await getWidgetDataFetcher().countByCustomColumn(entityType, entityFilters, groupByCustomColumnId);
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

    if (isPipelinePositionGrouping(groupByType)) return await this.calculatePipelinePositionGroup(widget);

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

    if (isPipelinePositionGrouping(groupByType)) return await this.calculatePipelinePositionGroup(widget);

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

    if (isPipelinePositionGrouping(groupByType)) return await this.calculatePipelinePositionGroup(widget);

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
