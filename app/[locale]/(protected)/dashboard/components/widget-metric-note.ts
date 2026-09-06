import type { AggregationType } from "@/generated/prisma";
import type { DiagramMetrics, WidgetDataSummary } from "@/features/widget/widget.schema";

import { isDurationAggregation, isRateAggregation } from "@/features/widget/widget-aggregation";

export type WidgetMetricNote =
  | { kind: "winRateDenominator"; sampleSize: number }
  | { kind: "meanAndMedian"; mean: number | null; median: number | null }
  | null;

export function widgetMetricNote(
  aggregationType: AggregationType,
  dataSummary: WidgetDataSummary | null,
): WidgetMetricNote {
  if (isRateAggregation(aggregationType))
    return { kind: "winRateDenominator", sampleSize: dataSummary?.sampleSize ?? 0 };

  if (isDurationAggregation(aggregationType))
    return { kind: "meanAndMedian", mean: dataSummary?.headline ?? null, median: dataSummary?.median ?? null };

  return null;
}

export function widgetPointMetricNote(
  aggregationType: AggregationType,
  metrics: DiagramMetrics | undefined,
): WidgetMetricNote {
  if (!metrics) return null;

  if (isRateAggregation(aggregationType)) return { kind: "winRateDenominator", sampleSize: metrics.sampleSize ?? 0 };

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
