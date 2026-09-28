"use client";

import { useTranslations } from "next-intl";
import { InvoiceStatus } from "@/generated/prisma";

import { Badge } from "@/components/ui/badge";

const STATUS_BADGE = {
  draft: "secondary",
  issued: "info",
  paid: "success",
  void: "outline",
} as const satisfies Record<InvoiceStatus, string>;

export function useInvoiceStatusLabel() {
  const t = useTranslations();

  return (status: InvoiceStatus) => {
    switch (status) {
      case InvoiceStatus.draft:
        return t("Invoices.status.draft");
      case InvoiceStatus.issued:
        return t("Invoices.status.issued");
      case InvoiceStatus.paid:
        return t("Invoices.status.paid");
      case InvoiceStatus.void:
        return t("Invoices.status.void");
    }
  };
}

export function InvoiceStatusBadge({ status, overdue }: { status: InvoiceStatus; overdue: boolean }) {
  const t = useTranslations();
  const label = useInvoiceStatusLabel();

  if (overdue) {
    return (
      <Badge data-invoice-status="overdue" variant="destructive">
        {t("Invoices.status.overdue")}
      </Badge>
    );
  }

  return (
    <Badge data-invoice-status={status} variant={STATUS_BADGE[status]}>
      {label(status)}
    </Badge>
  );
}
