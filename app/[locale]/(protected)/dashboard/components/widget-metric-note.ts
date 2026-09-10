import type { AggregationType } from "@/generated/prisma";
import type { DiagramMetrics, WidgetDataSummary } from "@/features/widget/widget.schema";

import { WinRateBasis } from "@/features/widget/widget.schema";
import { isDurationAggregation, isRateAggregation } from "@/features/widget/widget-aggregation";

export type WidgetMetricNote =
  | { kind: "winRateDenominator"; sampleSize: number }
  | { kind: "winRateValueDenominator"; closedValue: number }
  | { kind: "meanAndMedian"; mean: number | null; median: number | null }
  | null;

function closedValueOf(metrics: { wonValue?: number; lostValue?: number } | undefined): number {
  return (metrics?.wonValue ?? 0) + (metrics?.lostValue ?? 0);
}

export function widgetMetricNote(
  aggregationType: AggregationType,
  dataSummary: WidgetDataSummary | null,
  winRate?: { basis: WinRateBasis; totals: { wonValue: number; lostValue: number } },
): WidgetMetricNote {
  if (isRateAggregation(aggregationType)) {
    if (winRate?.basis === WinRateBasis.value)
      return { kind: "winRateValueDenominator", closedValue: closedValueOf(winRate.totals) };

    return { kind: "winRateDenominator", sampleSize: dataSummary?.sampleSize ?? 0 };
  }

  if (isDurationAggregation(aggregationType))
    return { kind: "meanAndMedian", mean: dataSummary?.headline ?? null, median: dataSummary?.median ?? null };

  return null;
}

export function widgetPointMetricNote(
  aggregationType: AggregationType,
  metrics: DiagramMetrics | undefined,
  basis: WinRateBasis = WinRateBasis.count,
): WidgetMetricNote {
  if (!metrics) return null;

  if (isRateAggregation(aggregationType)) {
    if (basis === WinRateBasis.value) return { kind: "winRateValueDenominator", closedValue: closedValueOf(metrics) };

    return { kind: "winRateDenominator", sampleSize: metrics.sampleSize ?? 0 };
  }

  if (isDurationAggregation(aggregationType))
    return { kind: "meanAndMedian", mean: metrics.mean ?? null, median: metrics.median ?? null };

  return null;
}

export function widgetHeadlineValue(
  aggregationType: AggregationType,
  dataSummary: WidgetDataSummary | null,
  summedValue: number,
): number {
  if (isRateAggregation(aggregationType) || isDurationAggregation(aggregationType)) return dataSummary?.headline ?? 0;

  return summedValue;
}
