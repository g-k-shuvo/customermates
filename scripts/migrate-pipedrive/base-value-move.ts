import { computeWeightedValue } from "@/features/deals/deal-weighting";

export type DealLine = { serviceId: string; amount: number; quantity: number };

export type DealTotals = {
  dealId: string;
  baseValue: number;
  weight: number | undefined;
  lines: readonly DealLine[];
};

export type BaseValueMove = {
  dealId: string;
  moved: number;
  baseValue: number;
  totalValue: number;
  totalQuantity: number;
  weightedValue: number | null;
};

/**
 * Folds the value-service line into Deal.baseValue and recomputes the totals the way
 * the deal repository's recalculateTotals does. totalValue is unchanged by the move;
 * totalQuantity loses the value-sized quantity the old migration put there.
 */
export function planBaseValueMove(deal: DealTotals, valueServiceId: string): BaseValueMove | null {
  const valueLines = deal.lines.filter((line) => line.serviceId === valueServiceId);
  if (valueLines.length === 0) return null;

  const remaining = deal.lines.filter((line) => line.serviceId !== valueServiceId);
  const moved = valueLines.reduce((sum, line) => sum + line.amount * line.quantity, 0);
  const baseValue = deal.baseValue + moved;
  const totalValue = remaining.reduce((sum, line) => sum + line.amount * line.quantity, baseValue);
  const totalQuantity = remaining.reduce((sum, line) => sum + line.quantity, 0);

  return {
    dealId: deal.dealId,
    moved,
    baseValue,
    totalValue,
    totalQuantity,
    weightedValue: computeWeightedValue(totalValue, deal.weight),
  };
}
