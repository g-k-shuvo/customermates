"use client";

import type { InvoiceEditorStore } from "./invoice-editor.store";

import { Plus, Trash2 } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { FormInput } from "@/components/forms/form-input";
import { FormNumberInput } from "@/components/forms/form-number-input";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { lineTotals } from "@/features/invoices/invoice-totals";

export const InvoiceLinesEditor = observer(({ store }: { store: InvoiceEditorStore }) => {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const editable = !store.isDisabled;

  return (
    <section aria-labelledby="invoice-lines-title" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold" id="invoice-lines-title">
          {t("Invoices.lines.title")}
        </h2>

        {editable && (
          <Button size="sm" type="button" variant="secondary" onClick={store.addLine}>
            <Plus aria-hidden className="size-4" />

            {t("Invoices.lines.add")}
          </Button>
        )}
      </div>

      {store.form.lines.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t("Invoices.lines.empty")}
        </p>
      ) : (
        <ol className="flex flex-col gap-2" data-invoice-lines="">
          {store.form.lines.map((line, index) => {
            const amounts = lineTotals({
              quantity: line.quantity ?? 0,
              unitPrice: line.unitPrice ?? 0,
              discountPercent: line.discountPercent ?? 0,
              taxRate: line.taxRate ?? 0,
            });

            return (
              <li
                key={index}
                className="grid grid-cols-2 items-end gap-2 rounded-xl border border-border p-3 sm:grid-cols-[minmax(0,1fr)_6rem_8rem_6rem_6rem_7rem_auto]"
                data-invoice-line={index}
              >
                <FormInput
                  containerClassName="col-span-2 sm:col-span-1"
                  id={`lines[${index}].description`}
                  label={t("Invoices.lines.description")}
                  maxLength={500}
                />

                <FormNumberInput id={`lines[${index}].quantity`} label={t("Invoices.lines.quantity")} />

                <FormNumberInput id={`lines[${index}].unitPrice`} label={t("Invoices.lines.unitPrice")} />

                <FormNumberInput id={`lines[${index}].discountPercent`} label={t("Invoices.lines.discount")} />

                <FormNumberInput id={`lines[${index}].taxRate`} label={t("Invoices.lines.taxRate")} />

                <div className="flex h-9 items-center justify-end text-sm tabular-nums">
                  {intlStore.formatCurrency(amounts.netAmount, store.form.currency)}
                </div>

                {editable && (
                  <IconButton
                    icon={Trash2}
                    label={t("Invoices.lines.remove", { position: index + 1 })}
                    type="button"
                    onClick={() => store.removeLine(index)}
                  />
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
});
