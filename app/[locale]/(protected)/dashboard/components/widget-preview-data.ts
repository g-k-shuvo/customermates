import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { ChipColor } from "@/constants/chip-colors";
import type { DiagramDataPoint, WidgetDataSummary } from "@/features/widget/widget.schema";

import { AggregationType, CustomColumnType, WidgetGroupByType } from "@/generated/prisma";

import { isDurationAggregation, isRateAggregation } from "@/features/widget/widget-aggregation";
import { meanOf, medianOf, winRatePercent } from "@/features/widget/widget-metrics";

const PREVIEW_DURATION_SAMPLE = [8, 11, 12, 14, 15, 17, 21, 26, 34, 240];

const PREVIEW_DURATION_GROUP_SAMPLES = [
  [4, 6, 7, 9, 52],
  [3, 5, 6, 8, 31],
  [2, 4, 5, 7, 19],
  [1, 3, 4, 6, 12],
];

const PREVIEW_CLOSED_DEALS = [
  { wonCount: 24, lostCount: 18, wonValue: 96000, lostValue: 72000 },
  { wonCount: 15, lostCount: 20, wonValue: 60000, lostValue: 80000 },
  { wonCount: 9, lostCount: 11, wonValue: 36000, lostValue: 44000 },
  { wonCount: 6, lostCount: 3, wonValue: 24000, lostValue: 12000 },
];

const PREVIEW_TOTALS: Record<AggregationType, number> = {
  [AggregationType.count]: 128,
  [AggregationType.dealValue]: 375000,
  [AggregationType.dealQuantity]: 86,
  [AggregationType.dealWeightedValue]: 142500,
  [AggregationType.winRate]: winRatePercent(54, 52) ?? 0,
  [AggregationType.salesCycleDays]: meanOf(PREVIEW_DURATION_SAMPLE) ?? 0,
  [AggregationType.stageDurationDays]: meanOf(PREVIEW_DURATION_SAMPLE) ?? 0,
};

const DISTRIBUTIONS: Record<number, number[]> = {
  1: [1],
  2: [0.62, 0.38],
  3: [0.48, 0.32, 0.2],
  4: [0.4, 0.28, 0.2, 0.12],
};

type BuildChartPreviewDataArgs = {
  aggregationType: AggregationType;
  customColumns: CustomColumnDto[];
  fallbackLabels: string[];
  groupByCustomColumnId?: string;
  groupByType: WidgetGroupByType;
};

export function getChartPreviewTotal(aggregationType: AggregationType): number {
  return PREVIEW_TOTALS[aggregationType];
}

export function getChartPreviewSummary(aggregationType: AggregationType): WidgetDataSummary | null {
  if (isRateAggregation(aggregationType)) return { headline: winRatePercent(54, 52), median: null, sampleSize: 106 };

  if (isDurationAggregation(aggregationType)) {
    return {
      headline: meanOf(PREVIEW_DURATION_SAMPLE),
      median: medianOf(PREVIEW_DURATION_SAMPLE),
      sampleSize: PREVIEW_DURATION_SAMPLE.length,
    };
  }

  return null;
}

function previewGroups({
  customColumns,
  fallbackLabels,
  groupByCustomColumnId,
  groupByType,
}: Omit<BuildChartPreviewDataArgs, "aggregationType">): Array<{ label: string; color?: ChipColor }> {
  const selectedColumn =
    groupByType === WidgetGroupByType.customColumn
      ? customColumns.find(
          (column) => column.id === groupByCustomColumnId && column.type === CustomColumnType.singleSelect,
        )
      : undefined;
  const selectedOptions =
    selectedColumn?.type === CustomColumnType.singleSelect
      ? selectedColumn.options.options.toSorted((a, b) => a.index - b.index).slice(0, 4)
      : [];

  if (selectedOptions.length > 0)
    return selectedOptions.map((option) => ({ label: option.label, color: option.color }));

  return fallbackLabels.slice(0, 4).map((label) => ({ label }));
}

export function buildChartPreviewData({
  aggregationType,
  customColumns,
  fallbackLabels,
  groupByCustomColumnId,
  groupByType,
}: BuildChartPreviewDataArgs): DiagramDataPoint[] {
  const total = getChartPreviewTotal(aggregationType);

  if (groupByType === WidgetGroupByType.none) {
    const summary = getChartPreviewSummary(aggregationType);
    return [
      {
        labelKind: "system",
        systemLabelKey: "total",
        value: total,
        ...(summary
          ? { metrics: { mean: summary.headline, median: summary.median, sampleSize: summary.sampleSize } }
          : {}),
      },
    ];
  }

  const groups = previewGroups({ customColumns, fallbackLabels, groupByCustomColumnId, groupByType });

  if (isRateAggregation(aggregationType)) {
    return groups.map((group, index) => {
      const closed = PREVIEW_CLOSED_DEALS[index % PREVIEW_CLOSED_DEALS.length];
      return {
        labelKind: "literal" as const,
        label: group.label,
        value: winRatePercent(closed.wonCount, closed.lostCount) ?? 0,
        optionColor: group.color,
        metrics: { ...closed, sampleSize: closed.wonCount + closed.lostCount },
      };
    });
  }

  if (isDurationAggregation(aggregationType)) {
    return groups.map((group, index) => {
      const sample = PREVIEW_DURATION_GROUP_SAMPLES[index % PREVIEW_DURATION_GROUP_SAMPLES.length];
      return {
        labelKind: "literal" as const,
        label: group.label,
        value: meanOf(sample) ?? 0,
        optionColor: group.color,
        metrics: { mean: meanOf(sample), median: medianOf(sample), sampleSize: sample.length },
      };
    });
  }

  const weights = DISTRIBUTIONS[groups.length] ?? DISTRIBUTIONS[4];
  let assigned = 0;

  return groups.map((group, index) => {
    const isLast = index === groups.length - 1;
    const value = isLast ? total - assigned : Math.round(total * weights[index]);
    assigned += value;

    return { labelKind: "literal" as const, label: group.label, value, optionColor: group.color };
  });
}
