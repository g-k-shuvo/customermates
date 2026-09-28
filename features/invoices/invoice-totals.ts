export type InvoiceLineAmounts = {
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxRate: number;
};

export type LineTotals = { netAmount: number; taxAmount: number };

export type TaxBreakdownEntry = { taxRate: number; netAmount: number; taxAmount: number };

export type InvoiceTotals = {
  netTotal: number;
  taxTotal: number;
  grossTotal: number;
  taxBreakdown: TaxBreakdownEntry[];
};

const toCents = (amount: number) => Math.round(amount * 100);
const fromCents = (cents: number) => cents / 100;

function lineCents(line: InvoiceLineAmounts) {
  const net = Math.round(line.quantity * toCents(line.unitPrice) * (1 - line.discountPercent / 100));
  const tax = Math.round((net * line.taxRate) / 100);

  return { net, tax };
}

export function lineTotals(line: InvoiceLineAmounts): LineTotals {
  const { net, tax } = lineCents(line);

  return { netAmount: fromCents(net), taxAmount: fromCents(tax) };
}

export function invoiceTotals(lines: readonly InvoiceLineAmounts[]): InvoiceTotals {
  const netByRate = new Map<number, number>();

  for (const line of lines) netByRate.set(line.taxRate, (netByRate.get(line.taxRate) ?? 0) + lineCents(line).net);

  const breakdown = [...netByRate]
    .sort(([left], [right]) => left - right)
    .map(([taxRate, net]) => ({ taxRate, net, tax: Math.round((net * taxRate) / 100) }));
  const net = breakdown.reduce((sum, entry) => sum + entry.net, 0);
  const tax = breakdown.reduce((sum, entry) => sum + entry.tax, 0);

  return {
    netTotal: fromCents(net),
    taxTotal: fromCents(tax),
    grossTotal: fromCents(net + tax),
    taxBreakdown: breakdown.map((entry) => ({
      taxRate: entry.taxRate,
      netAmount: fromCents(entry.net),
      taxAmount: fromCents(entry.tax),
    })),
  };
}

export function balanceDue(grossTotal: number, paidAmount: number): number {
  return fromCents(toCents(grossTotal) - toCents(paidAmount));
}

export function formatInvoiceNumber(prefix: string, sequence: number): string {
  return `${prefix}${String(sequence).padStart(4, "0")}`;
}
