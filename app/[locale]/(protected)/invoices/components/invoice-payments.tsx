"use client";

import type { InvoiceDto } from "@/features/invoices/invoice.schema";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { InvoiceStatus } from "@/generated/prisma";

import { deleteInvoicePaymentAction, recordInvoicePaymentAction } from "../actions";

import { FormIsoDatePicker } from "@/components/forms/form-iso-date-picker";
import { FormNumberInput } from "@/components/forms/form-number-input";
import { toLocalIso } from "@/components/forms/iso-date-values";
import { FormLabel } from "@/components/forms/form-label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { runUserAction } from "@/core/errors/report-application-error";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

type Props = { invoice: InvoiceDto; canRecord: boolean; onChanged: (invoice: InvoiceDto) => void };

export function InvoicePayments({ invoice, canRecord, onChanged }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const [amount, setAmount] = useState<number | undefined>(invoice.balance);
  const [paidAt, setPaidAt] = useState<string | undefined>(() => toLocalIso(new Date(), true));
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const acceptsPayments = canRecord && invoice.status === InvoiceStatus.issued;

  const record = async () => {
    if (!amount) return;

    setIsSaving(true);
    try {
      const result = await recordInvoicePaymentAction({
        id: invoice.id,
        amount,
        ...(paidAt ? { paidAt: new Date(paidAt) } : {}),
        note: note.trim() === "" ? null : note.trim(),
      });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }

      const knownPaymentIds = new Set(invoice.payments.map((payment) => payment.id));
      const recordedPayment = result.data.payments.find((payment) => !knownPaymentIds.has(payment.id));
      toast.success(t("Invoices.payments.recorded"), {
        ...(recordedPayment
          ? {
              action: {
                label: t("Invoices.payments.undo"),
                onClick: () => runUserAction(() => undoPayment(result.data.id, recordedPayment.id)),
              },
            }
          : {}),
      });
      setAmount(result.data.balance);
      setNote("");
      onChanged(result.data);
    } finally {
      setIsSaving(false);
    }
  };

  const undoPayment = async (invoiceId: string, paymentId: string) => {
    const result = await deleteInvoicePaymentAction({ id: invoiceId, paymentId });
    if (!result.ok) {
      toastZodErrorTree(result.error);
      return;
    }

    toast.success(t("Invoices.payments.undone"));
    setAmount(result.data.balance);
    onChanged(result.data);
  };

  if (invoice.payments.length === 0 && !acceptsPayments) return null;

  return (
    <section aria-labelledby="invoice-payments-title" className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold" id="invoice-payments-title">
        {t("Invoices.payments.title")}
      </h2>

      {invoice.payments.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border" data-invoice-payments="">
          {invoice.payments.map((payment) => (
            <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
              <span>
                {intlStore.formatNumericalShortDate(payment.paidAt)}

                {payment.note ? <span className="text-muted-foreground"> · {payment.note}</span> : null}
              </span>

              <span className="tabular-nums">{intlStore.formatCurrency(payment.amount, invoice.currency)}</span>
            </li>
          ))}
        </ul>
      )}

      {acceptsPayments && (
        <form
          className="grid grid-cols-1 items-end gap-2 rounded-xl border border-border p-3 sm:grid-cols-[10rem_12rem_minmax(0,1fr)_auto]"
          data-invoice-payment-form=""
          onSubmit={(event) => {
            event.preventDefault();
            runUserAction(record);
          }}
        >
          <FormNumberInput
            required
            id="payment-amount"
            label={t("Invoices.payments.amount")}
            value={amount}
            onValueChange={setAmount}
          />

          <FormIsoDatePicker
            clearable={false}
            id="payment-date"
            label={t("Invoices.payments.date")}
            value={paidAt}
            onValueChange={setPaidAt}
          />

          <div className="space-y-1.5">
            <FormLabel htmlFor="payment-note">{t("Invoices.payments.note")}</FormLabel>

            <Input id="payment-note" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
          </div>

          <Button disabled={isSaving || !amount} type="submit">
            {t("Invoices.payments.record")}
          </Button>
        </form>
      )}
    </section>
  );
}
