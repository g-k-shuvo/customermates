import type { DiagramDataPoint } from "./widget.schema";

import { WinRateBasis } from "./widget.schema";

export type ClosedDealTotals = {
  wonCount: number;
  lostCount: number;
  wonValue: number;
  lostValue: number;
};

export function meanOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export function winRatePercent(wonCount: number, lostCount: number): number | null {
  const closedDeals = wonCount + lostCount;
  if (closedDeals <= 0) return null;

  return (wonCount / closedDeals) * 100;
}

export function winRateForBasis(totals: ClosedDealTotals, basis: WinRateBasis): number | null {
  return basis === WinRateBasis.value
    ? winRatePercent(totals.wonValue, totals.lostValue)
    : winRatePercent(totals.wonCount, totals.lostCount);
}

export function closedDealDenominator(totals: ClosedDealTotals, basis: WinRateBasis): number {
  return basis === WinRateBasis.value ? totals.wonValue + totals.lostValue : totals.wonCount + totals.lostCount;
}

export function closedDealTotals(points: readonly DiagramDataPoint[]): ClosedDealTotals {
  return points.reduce<ClosedDealTotals>(
    (totals, point) => ({
      wonCount: totals.wonCount + (point.metrics?.wonCount ?? 0),
      lostCount: totals.lostCount + (point.metrics?.lostCount ?? 0),
      wonValue: totals.wonValue + (point.metrics?.wonValue ?? 0),
      lostValue: totals.lostValue + (point.metrics?.lostValue ?? 0),
    }),
    { wonCount: 0, lostCount: 0, wonValue: 0, lostValue: 0 },
  );
}
