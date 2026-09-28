"use client";

import type { ReactNode } from "react";
import type { InvoiceListDto } from "@/features/invoices/invoice.schema";

import { FilePlus2, ReceiptText, Settings } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Action, InvoiceStatus, Resource } from "@/generated/prisma";

import { createInvoiceAction } from "../actions";

import { InvoicesListStore } from "./invoices-list.store";
import { InvoicesPageSkeleton } from "./invoices-page-skeleton";
import { InvoiceStatusBadge, useInvoiceStatusLabel } from "./invoice-status-badge";

import { PageState } from "@/components/page-state/page-state";
import { AppLink } from "@/components/shared/app-link";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { runUserAction } from "@/core/errors/report-application-error";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { useRootStore } from "@/core/stores/root-store.provider";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { useRouter } from "@/i18n/navigation";

const STATUS_FILTERS = [null, InvoiceStatus.draft, InvoiceStatus.issued, InvoiceStatus.paid, InvoiceStatus.void];

export const InvoicesPageView = observer(({ initial }: { initial: InvoiceListDto }) => {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const router = useRouter();
  const statusLabel = useInvoiceStatusLabel();
  const { layoutStore, userStore } = useRootStore();
  const store = useMemo(() => new InvoicesListStore(), []);
  const [isCreating, setIsCreating] = useState(false);
  const canCreate = userStore.can(Resource.invoices, Action.create);
  const title = t("Invoices.title");

  useEffect(() => store.hydrate(initial), [store, initial]);

  useEffect(() => {
    layoutStore.setRuntimeIdentity({ scope: "entity", key: "invoices", title, pictureUrl: null, avatarKind: null });

    return () => layoutStore.clearRuntimeIdentity("entity", "invoices");
  }, [layoutStore, title]);

  const createDraft = async () => {
    setIsCreating(true);
    try {
      const result = await createInvoiceAction({});
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }

      router.push(`/invoices/${result.data.id}`);
    } finally {
      setIsCreating(false);
    }
  };

  const pageState = store.pageState;
  let body: ReactNode;
  switch (pageState) {
    case "loading":
      body = <PageState background={<InvoicesPageSkeleton />} label={t("PageState.loading")} state="loading" />;
      break;
    case "error":
      body = (
        <PageState
          action={
            <Button size="sm" variant="secondary" onClick={() => runUserAction(() => store.load())}>
              {t("ErrorCard.retry")}
            </Button>
          }
          description={t("ErrorCard.contactSupport")}
          state="error"
          title={t("ErrorCard.title")}
        />
      );
      break;
    case "filtered-empty":
      body = (
        <PageState
          background={<InvoicesPageSkeleton />}
          description={t("Invoices.filteredEmptyDescription")}
          icon={ReceiptText}
          state="empty"
          title={t("Invoices.filteredEmptyTitle")}
        />
      );
      break;
    case "true-empty":
      body = (
        <PageState
          background={<InvoicesPageSkeleton />}
          description={t("Invoices.emptyDescription")}
          icon={ReceiptText}
          state="empty"
          title={t("Invoices.emptyTitle")}
        />
      );
      break;
    case "content": {
      const data = store.data;
      body = (
        <div className="flex flex-col gap-3">
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table data-invoices-table="">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Invoices.columns.number")}</TableHead>

                  <TableHead>{t("Invoices.columns.buyer")}</TableHead>

                  <TableHead>{t("Invoices.columns.status")}</TableHead>

                  <TableHead>{t("Invoices.columns.issueDate")}</TableHead>

                  <TableHead>{t("Invoices.columns.dueDate")}</TableHead>

                  <TableHead className="text-right">{t("Invoices.columns.total")}</TableHead>

                  <TableHead className="text-right">{t("Invoices.columns.balance")}</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {data?.items.map((invoice) => (
                  <TableRow key={invoice.id} data-invoice-row={invoice.id}>
                    <TableCell className="font-medium">
                      <AppLink href={`/invoices/${invoice.id}`}>{invoice.number ?? t("Invoices.draftNumber")}</AppLink>
                    </TableCell>

                    <TableCell className="max-w-64 truncate">
                      {invoice.buyerName || invoice.organization?.name || t("Invoices.noBuyer")}
                    </TableCell>

                    <TableCell>
                      <InvoiceStatusBadge overdue={invoice.overdue} status={invoice.status} />
                    </TableCell>

                    <TableCell>
                      {invoice.issueDate ? intlStore.formatNumericalShortDate(invoice.issueDate) : ""}
                    </TableCell>

                    <TableCell>{invoice.dueDate ? intlStore.formatNumericalShortDate(invoice.dueDate) : ""}</TableCell>

                    <TableCell className="text-right tabular-nums">
                      {intlStore.formatCurrency(invoice.grossTotal, invoice.currency)}
                    </TableCell>

                    <TableCell className="text-right tabular-nums">
                      {intlStore.formatCurrency(invoice.balance, invoice.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {store.lastPage > 1 && data && (
            <div className="flex items-center justify-end gap-2">
              <span className="text-sm text-muted-foreground">
                {t("Invoices.page", { page: data.page, pages: store.lastPage })}
              </span>

              <Button
                disabled={data.page <= 1}
                size="sm"
                variant="secondary"
                onClick={() => runUserAction(() => store.load(data.page - 1))}
              >
                {t("Invoices.previous")}
              </Button>

              <Button
                disabled={data.page >= store.lastPage}
                size="sm"
                variant="secondary"
                onClick={() => runUserAction(() => store.load(data.page + 1))}
              >
                {t("Invoices.next")}
              </Button>
            </div>
          )}
        </div>
      );
      break;
    }
    default: {
      const exhaustive: never = pageState;
      throw new Error(String(exhaustive));
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-lg font-semibold">{title}</h1>

          <p className="text-sm text-muted-foreground">{t("Invoices.description")}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="secondary">
            <AppLink appearance="unstyled" href="/company/invoicing" id="invoices-settings">
              <Settings aria-hidden className="size-4" />

              {t("InvoiceSettings.title")}
            </AppLink>
          </Button>

          {canCreate && (
            <Button disabled={isCreating} size="sm" onClick={() => runUserAction(createDraft)}>
              <FilePlus2 aria-hidden className="size-4" />

              {t("Invoices.create")}
            </Button>
          )}
        </div>
      </header>

      <div aria-label={t("Invoices.filterLabel")} className="flex flex-wrap gap-1.5" role="group">
        {STATUS_FILTERS.map((status) => (
          <Button
            key={status ?? "all"}
            aria-pressed={store.status === status}
            size="sm"
            variant={store.status === status ? "default" : "secondary"}
            onClick={() => runUserAction(() => store.filter(status))}
          >
            {status ? statusLabel(status) : t("Invoices.allStatuses")}
          </Button>
        ))}
      </div>

      {body}
    </div>
  );
});
