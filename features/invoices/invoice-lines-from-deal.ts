import type { DealForInvoice } from "./invoice.repo";
import type { InvoiceLineInput } from "./invoice.schema";

export function invoiceLinesFromDeal(deal: DealForInvoice, taxRate: number): InvoiceLineInput[] {
  return [
    ...(deal.baseValue > 0
      ? [{ description: deal.name, quantity: 1, unitPrice: deal.baseValue, discountPercent: 0, taxRate }]
      : []),
    ...deal.services.map((service) => ({
      description: service.name,
      quantity: service.quantity,
      unitPrice: service.amount,
      discountPercent: 0,
      taxRate,
      serviceId: service.serviceId,
    })),
  ];
}
