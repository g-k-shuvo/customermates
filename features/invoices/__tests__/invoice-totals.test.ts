import { describe, expect, it } from "vitest";

import { balanceDue, formatInvoiceNumber, invoiceTotals, lineTotals } from "../invoice-totals";

describe("invoice arithmetic", () => {
  it("computes a line net after discount and its tax in exact cents", () => {
    expect(lineTotals({ quantity: 3, unitPrice: 19.99, discountPercent: 10, taxRate: 19 })).toEqual({
      netAmount: 53.97,
      taxAmount: 10.25,
    });
  });

  it("avoids floating-point drift across many small lines", () => {
    const lines = Array.from({ length: 10 }, () => ({ quantity: 1, unitPrice: 0.1, discountPercent: 0, taxRate: 0 }));

    expect(invoiceTotals(lines).grossTotal).toBe(1);
  });

  it("totals mixed tax rates and breaks the tax down per rate", () => {
    const totals = invoiceTotals([
      { quantity: 1, unitPrice: 50000, discountPercent: 0, taxRate: 19 },
      { quantity: 2, unitPrice: 100, discountPercent: 0, taxRate: 7 },
      { quantity: 1, unitPrice: 30, discountPercent: 0, taxRate: 19 },
    ]);

    expect(totals).toEqual({
      netTotal: 50230,
      taxTotal: 9519.7,
      grossTotal: 59749.7,
      taxBreakdown: [
        { taxRate: 7, netAmount: 200, taxAmount: 14 },
        { taxRate: 19, netAmount: 50030, taxAmount: 9505.7 },
      ],
    });
  });

  it("rounds the tax once per rate on the summed net, as EN 16931 requires", () => {
    const lines = Array.from({ length: 3 }, () => ({ quantity: 1, unitPrice: 0.03, discountPercent: 0, taxRate: 19 }));

    expect(lines.map((line) => lineTotals(line).taxAmount)).toEqual([0.01, 0.01, 0.01]);
    expect(invoiceTotals(lines).taxTotal).toBe(0.02);
  });

  it("reports the balance left after payments", () => {
    expect(balanceDue(119.99, 100)).toBe(19.99);
  });

  it("pads the sequence behind the prefix", () => {
    expect(formatInvoiceNumber("INV-2026-", 7)).toBe("INV-2026-0007");
    expect(formatInvoiceNumber("R", 12345)).toBe("R12345");
  });
});
