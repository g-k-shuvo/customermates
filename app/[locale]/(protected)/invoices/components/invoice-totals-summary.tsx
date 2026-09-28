"use client";

import type { TaxBreakdownEntry } from "@/features/invoices/invoice-totals";

import { useTranslations } from "next-intl";

import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

type Props = {
  currency: string;
  netTotal: number;
  taxTotal: number;
  grossTotal: number;
  taxBreakdown: readonly TaxBreakdownEntry[];
  paidAmount?: number;
  balance?: number;
};

export function InvoiceTotalsSummary({
  currency,
  netTotal,
  taxTotal,
  grossTotal,
  taxBreakdown,
  paidAmount,
  balance,
}: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const money = (amount: number) => intlStore.formatCurrency(amount, currency);

  return (
    <dl className="ml-auto grid w-full max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm" data-invoice-totals="">
      <dt className="text-muted-foreground">{t("Invoices.totals.net")}</dt>

      <dd className="text-right tabular-nums" data-invoice-net="">
        {money(netTotal)}
      </dd>

      {taxBreakdown.map((entry) => (
        <div key={entry.taxRate} className="contents">
          <dt className="text-muted-foreground">
            {t("Invoices.totals.taxAtRate", {
              rate: intlStore.formatNumber(entry.taxRate, { maximumFractionDigits: 2 }),
            })}
          </dt>

          <dd className="text-right tabular-nums">{money(entry.taxAmount)}</dd>
        </div>
      ))}

      {taxBreakdown.length === 0 && (
        <>
          <dt className="text-muted-foreground">{t("Invoices.totals.tax")}</dt>

          <dd className="text-right tabular-nums">{money(taxTotal)}</dd>
        </>
      )}

      <dt className="border-t border-border pt-1 font-semibold">{t("Invoices.totals.gross")}</dt>

      <dd className="border-t border-border pt-1 text-right font-semibold tabular-nums" data-invoice-gross="">
        {money(grossTotal)}
      </dd>

      {paidAmount !== undefined && paidAmount > 0 && (
        <>
          <dt className="text-muted-foreground">{t("Invoices.totals.paid")}</dt>

          <dd className="text-right tabular-nums">{money(paidAmount)}</dd>
        </>
      )}

      {balance !== undefined && (
        <>
          <dt className="font-medium">{t("Invoices.totals.balance")}</dt>

          <dd className="text-right font-medium tabular-nums" data-invoice-balance="">
            {money(balance)}
          </dd>
        </>
      )}
    </dl>
  );
}
