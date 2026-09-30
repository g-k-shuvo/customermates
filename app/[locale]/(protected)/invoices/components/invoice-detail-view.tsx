"use client";

import type { InvoiceDto, InvoiceSettingsDto } from "@/features/invoices/invoice.schema";

import { ArrowLeft } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useEffect, useId, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Action, EntityType, InvoiceStatus, Resource } from "@/generated/prisma";

import { deleteInvoiceAction, issueInvoiceAction, voidInvoiceAction } from "../actions";

import { InvoiceDownloads } from "./invoice-downloads";
import { InvoiceEditorStore } from "./invoice-editor.store";
import { InvoiceLinesEditor } from "./invoice-lines-editor";
import { InvoicePayments } from "./invoice-payments";
import { InvoiceStatusBadge } from "./invoice-status-badge";
import { InvoiceTotalsSummary } from "./invoice-totals-summary";

import { AppForm } from "@/components/forms/form-context";
import { FormAutocompleteCurrency } from "@/components/forms/form-autocomplete-currency";
import { FormInput } from "@/components/forms/form-input";
import { FormIsoDatePicker } from "@/components/forms/form-iso-date-picker";
import { FormTextarea } from "@/components/forms/form-textarea";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { useEntityHref } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { AppLink } from "@/components/shared/app-link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { runUserAction } from "@/core/errors/report-application-error";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { useRootStore } from "@/core/stores/root-store.provider";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { useRouter } from "@/i18n/navigation";

type Props = { initial: InvoiceDto; settings: InvoiceSettingsDto };

function AddressBlock({ title, lines }: { title: string; lines: (string | null | undefined)[] }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border p-4 text-sm">
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h2>

      {lines
        .filter((line): line is string => Boolean(line))
        .map((line, index) => (
          <p key={index} className="whitespace-pre-line">
            {line}
          </p>
        ))}
    </div>
  );
}

export const InvoiceDetailView = observer(({ initial, settings }: Props) => {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const router = useRouter();
  const formId = useId();
  const rootStore = useRootStore();
  const entityHref = useEntityHref();
  const { showConfirmation, showDeleteConfirmation } = useDeleteConfirmation();
  const [invoice, setInvoice] = useState(initial);
  const [isBusy, setIsBusy] = useState(false);
  const store = useMemo(
    () => new InvoiceEditorStore(rootStore, initial, settings.defaultTaxRate, setInvoice),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seeded once; a new server snapshot reloads through the effect below
    [rootStore, settings.defaultTaxRate],
  );
  const { userStore, layoutStore } = rootStore;
  const canUpdate = userStore.can(Resource.invoices, Action.update);
  const canDelete = userStore.can(Resource.invoices, Action.delete);
  const isDraft = invoice.status === InvoiceStatus.draft;
  const sellerMissing = settings.sellerName.trim() === "" || settings.sellerAddress.trim() === "";
  const buyerMissing = !store.form.buyerName.trim() || !store.form.buyerAddress.trim();
  const title = invoice.number ?? t("Invoices.draftNumber");

  useEffect(() => {
    if (initial.status === InvoiceStatus.draft) store.load(initial);
    setInvoice(initial);
  }, [store, initial]);

  useEffect(() => {
    layoutStore.setRuntimeIdentity({ scope: "entity", key: "invoice", title, pictureUrl: null, avatarKind: null });

    return () => layoutStore.clearRuntimeIdentity("entity", "invoice");
  }, [layoutStore, title]);

  const busy = async (work: () => Promise<void>) => {
    setIsBusy(true);
    try {
      await work();
    } finally {
      setIsBusy(false);
    }
  };

  const issue = () =>
    showConfirmation({
      title: t("Invoices.issueConfirm.title"),
      message: t("Invoices.issueConfirm.message", { prefix: settings.numberPrefix }),
      confirmLabel: t("Invoices.issue"),
      confirmVariant: "default",
      successKey: "Common.notifications.updated",
      onConfirm: async () => {
        if (store.hasUnsavedChanges && !(await store.save())) return false;

        const result = await issueInvoiceAction({ id: invoice.id });
        if (!result.ok) {
          toastZodErrorTree(result.error);
          return false;
        }

        setInvoice(result.data);
        return true;
      },
    });

  const voidInvoice = () =>
    showConfirmation({
      title: t("Invoices.voidConfirm.title"),
      message: t("Invoices.voidConfirm.message", { number: invoice.number ?? "" }),
      confirmLabel: t("Invoices.void"),
      confirmVariant: "destructive",
      successKey: "Common.notifications.updated",
      onConfirm: async () => {
        const result = await voidInvoiceAction(invoice.id);
        if (!result.ok) {
          toastZodErrorTree(result.error);
          return false;
        }

        setInvoice(result.data);
        return true;
      },
    });

  const deleteDraft = () =>
    showDeleteConfirmation(async () => {
      const result = await deleteInvoiceAction(invoice.id);
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return false;
      }

      router.push("/invoices");
      return true;
    }, t("Invoices.draftNumber"));

  const related = (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
      {invoice.deal && (
        <span>
          {`${t("Invoices.fromDeal")} `}

          <AppLink href={entityHref(EntityType.deal, invoice.deal.id)}>{invoice.deal.name}</AppLink>
        </span>
      )}

      {invoice.organization && (
        <AppLink href={entityHref(EntityType.organization, invoice.organization.id)}>
          {invoice.organization.name}
        </AppLink>
      )}

      {invoice.issueDate && (
        <span>{t("Invoices.issuedOn", { date: intlStore.formatNumericalShortDate(invoice.issueDate) })}</span>
      )}

      {invoice.dueDate && (
        <span>{t("Invoices.dueOn", { date: intlStore.formatNumericalShortDate(invoice.dueDate) })}</span>
      )}
    </div>
  );

  return (
    <div className="flex w-full max-w-5xl flex-col gap-6 p-4 md:p-6" data-invoice-id={invoice.id}>
      <AppLink className="flex w-fit items-center gap-1 text-sm text-muted-foreground" href="/invoices">
        <ArrowLeft aria-hidden className="size-4" />

        {t("Invoices.backToList")}
      </AppLink>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold" data-invoice-number="">
              {title}
            </h1>

            <InvoiceStatusBadge overdue={invoice.overdue} status={invoice.status} />
          </div>

          {related}
        </div>

        <div className="flex flex-wrap gap-2">
          <InvoiceDownloads invoice={invoice} />

          {isDraft && canDelete && (
            <Button disabled={isBusy} size="sm" variant="secondary" onClick={deleteDraft}>
              {t("Common.actions.delete")}
            </Button>
          )}

          {isDraft && canUpdate && (
            <Button
              disabled={isBusy || store.isLoading || !store.hasUnsavedChanges}
              form={formId}
              size="sm"
              type="submit"
              variant="secondary"
            >
              {t("Common.actions.save")}
            </Button>
          )}

          {isDraft && canUpdate && (
            <Button disabled={isBusy || store.isLoading || sellerMissing || buyerMissing} size="sm" onClick={issue}>
              {t("Invoices.issue")}
            </Button>
          )}

          {invoice.status === InvoiceStatus.issued && canUpdate && (
            <Button disabled={isBusy} size="sm" variant="secondary" onClick={voidInvoice}>
              {t("Invoices.void")}
            </Button>
          )}
        </div>
      </header>

      {isDraft && sellerMissing && (
        <Alert data-invoice-seller-missing="">
          <AlertDescription>
            {t.rich("Invoices.sellerMissing", {
              link: (chunks) => <AppLink href="/company/invoicing">{chunks}</AppLink>,
            })}
          </AlertDescription>
        </Alert>
      )}

      {isDraft && !sellerMissing && buyerMissing && (
        <Alert data-invoice-buyer-missing="">
          <AlertDescription>{t("Invoices.buyerMissing")}</AlertDescription>
        </Alert>
      )}

      {isDraft ? (
        <AppForm
          className="flex flex-col gap-6"
          id={formId}
          store={store}
          onSubmit={(event) => {
            event.preventDefault();
            runUserAction(() => busy(() => store.onSubmit()));
          }}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <section aria-labelledby="invoice-buyer-title" className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold" id="invoice-buyer-title">
                {t("Invoices.buyer.title")}
              </h2>

              <FormInput id="buyerName" label={t("Invoices.buyer.name")} maxLength={200} />

              <FormTextarea id="buyerAddress" label={t("Invoices.buyer.address")} maxLength={1000} rows={3} />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormInput id="buyerVatId" label={t("Invoices.buyer.vatId")} maxLength={64} />

                <FormInput id="buyerEmail" label={t("Invoices.buyer.email")} type="email" />
              </div>
            </section>

            <section aria-labelledby="invoice-terms-title" className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold" id="invoice-terms-title">
                {t("Invoices.terms.title")}
              </h2>

              <FormAutocompleteCurrency required id="currency" />

              <FormIsoDatePicker id="dueDate" label={t("Invoices.terms.dueDate")} />

              <p className="text-xs text-muted-foreground">
                {t("Invoices.terms.dueDateHint", { days: settings.paymentTermsDays })}
              </p>

              <FormTextarea id="notes" label={t("Invoices.terms.notes")} maxLength={4000} rows={3} />
            </section>
          </div>

          <InvoiceLinesEditor store={store} />

          <InvoiceTotalsSummary currency={store.form.currency} {...store.totals} />
        </AppForm>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <AddressBlock
              lines={[invoice.seller?.name, invoice.seller?.address, invoice.seller?.vatId, invoice.seller?.email]}
              title={t("Invoices.seller")}
            />

            <AddressBlock
              lines={[invoice.buyerName, invoice.buyerAddress, invoice.buyerVatId, invoice.buyerEmail]}
              title={t("Invoices.buyer.title")}
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <Table data-invoice-lines="">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Invoices.lines.description")}</TableHead>

                  <TableHead className="text-right">{t("Invoices.lines.quantity")}</TableHead>

                  <TableHead className="text-right">{t("Invoices.lines.unitPrice")}</TableHead>

                  <TableHead className="text-right">{t("Invoices.lines.discount")}</TableHead>

                  <TableHead className="text-right">{t("Invoices.lines.taxRate")}</TableHead>

                  <TableHead className="text-right">{t("Invoices.lines.net")}</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {invoice.lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>{line.description}</TableCell>

                    <TableCell className="text-right tabular-nums">{intlStore.formatNumber(line.quantity)}</TableCell>

                    <TableCell className="text-right tabular-nums">
                      {intlStore.formatCurrency(line.unitPrice, invoice.currency)}
                    </TableCell>

                    <TableCell className="text-right tabular-nums">
                      {intlStore.formatNumber(line.discountPercent, { maximumFractionDigits: 2 })}
                    </TableCell>

                    <TableCell className="text-right tabular-nums">
                      {intlStore.formatNumber(line.taxRate, { maximumFractionDigits: 2 })}
                    </TableCell>

                    <TableCell className="text-right tabular-nums">
                      {intlStore.formatCurrency(line.netAmount, invoice.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <InvoiceTotalsSummary
            balance={invoice.balance}
            currency={invoice.currency}
            grossTotal={invoice.grossTotal}
            netTotal={invoice.netTotal}
            paidAmount={invoice.paidAmount}
            taxBreakdown={invoice.taxBreakdown}
            taxTotal={invoice.taxTotal}
          />

          {invoice.notes && <p className="whitespace-pre-line text-sm text-muted-foreground">{invoice.notes}</p>}

          <InvoicePayments canRecord={canUpdate} invoice={invoice} onChanged={setInvoice} />
        </>
      )}
    </div>
  );
});
