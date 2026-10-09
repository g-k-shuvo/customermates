"use client";

import type { InvoiceListDto } from "@/features/invoices/invoice.schema";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { FilePlus2, ReceiptText } from "lucide-react";

import { createInvoiceAction, getInvoicesAction } from "@/app/[locale]/(protected)/invoices/actions";
import { InvoiceStatusBadge } from "@/app/[locale]/(protected)/invoices/components/invoice-status-badge";
import { OrganizationBillingProfile } from "@/components/entity-detail/organization-billing-profile";
import { PageState } from "@/components/page-state/page-state";
import { AppLink } from "@/components/shared/app-link";
import { Button } from "@/components/ui/button";
import { runUserAction } from "@/core/errors/report-application-error";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { useRouter } from "@/i18n/navigation";
import { CALENDAR_DATE } from "@/core/stores/intl.store";

type Props =
  | { dealId: string; organizationId?: undefined; canCreate: boolean; canEditBilling?: undefined }
  | { organizationId: string; dealId?: undefined; canCreate: boolean; canEditBilling: boolean };

type PanelState = { status: "loading" } | { status: "ready"; list: InvoiceListDto } | { status: "error" };

export function EntityInvoicesPanel({ dealId, organizationId, canCreate, canEditBilling }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const router = useRouter();
  const [state, setState] = useState<PanelState>({ status: "loading" });
  const [isCreating, setIsCreating] = useState(false);

  const load = useCallback(async () => {
    const result = await getInvoicesAction(dealId ? { dealId } : { organizationId });
    setState(result.ok ? { status: "ready", list: result.data } : { status: "error" });
  }, [dealId, organizationId]);

  useEffect(() => {
    setState({ status: "loading" });
    runUserAction(load);
  }, [load]);

  const create = async () => {
    setIsCreating(true);
    try {
      const result = await createInvoiceAction(dealId ? { dealId } : { organizationId });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }

      router.push(`/invoices/${result.data.id}`);
    } finally {
      setIsCreating(false);
    }
  };

  if (state.status === "error") {
    return (
      <PageState
        action={
          <Button size="sm" variant="secondary" onClick={() => runUserAction(load)}>
            {t("ErrorCard.retry")}
          </Button>
        }
        state="error"
        title={t("Invoices.panel.loadError")}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-invoices-panel="">
      {organizationId && <OrganizationBillingProfile canEdit={canEditBilling} organizationId={organizationId} />}

      {canCreate && (
        <div className="flex items-center justify-between gap-3 border-b p-3">
          <p className="text-xs text-muted-foreground">
            {dealId ? t("Invoices.panel.createHintDeal") : t("Invoices.panel.createHintOrganization")}
          </p>

          <Button disabled={isCreating} size="sm" variant="secondary" onClick={() => runUserAction(create)}>
            <FilePlus2 aria-hidden className="size-4" />

            {t("Invoices.create")}
          </Button>
        </div>
      )}

      {state.status === "loading" ? (
        <p aria-live="polite" className="p-4 text-sm text-muted-foreground">
          {t("PageState.loading")}
        </p>
      ) : state.list.items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          <ReceiptText aria-hidden className="size-6 text-muted-foreground" />

          <p className="text-sm font-medium">{t("Invoices.panel.emptyTitle")}</p>
        </div>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-invoices-panel-list="">
          {state.list.items.map((invoice) => (
            <li key={invoice.id} className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <AppLink className="truncate text-sm font-medium" href={`/invoices/${invoice.id}`}>
                  {invoice.number ?? t("Invoices.draftNumber")}
                </AppLink>

                <span className="truncate text-xs text-muted-foreground">
                  {invoice.issueDate
                    ? t("Invoices.issuedOn", {
                        date: intlStore.formatNumericalShortDate(invoice.issueDate, CALENDAR_DATE),
                      })
                    : t("Invoices.createdOn", { date: intlStore.formatNumericalShortDate(invoice.createdAt) })}
                </span>
              </div>

              <InvoiceStatusBadge overdue={invoice.overdue} status={invoice.status} />

              <span className="text-sm tabular-nums">
                {intlStore.formatCurrency(invoice.grossTotal, invoice.currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
