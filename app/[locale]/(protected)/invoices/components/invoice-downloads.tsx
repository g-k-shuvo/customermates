"use client";

import type { InvoiceDto } from "@/features/invoices/invoice.schema";
import type { XRechnungGap } from "@/features/invoices/document/xrechnung";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { InvoiceStatus } from "@/generated/prisma";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { runUserAction } from "@/core/errors/report-application-error";
import { xRechnungGaps } from "@/features/invoices/document/xrechnung";

function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function fileNameFrom(response: Response, fallback: string): string {
  return /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? fallback;
}

export function InvoiceDownloads({ invoice }: { invoice: InvoiceDto }) {
  const t = useTranslations();
  const locale = useLocale();
  const [isDownloading, setIsDownloading] = useState(false);
  const eInvoiceable = invoice.status === InvoiceStatus.issued || invoice.status === InvoiceStatus.paid;
  const gaps = eInvoiceable ? xRechnungGaps(invoice) : [];

  const gapLabel = (gap: XRechnungGap) => {
    switch (gap) {
      case "sellerEmail":
        return t("Invoices.downloads.gaps.sellerEmail");
      case "sellerPhone":
        return t("Invoices.downloads.gaps.sellerPhone");
      case "sellerVatId":
        return t("Invoices.downloads.gaps.sellerVatId");
      case "sellerPostalAddress":
        return t("Invoices.downloads.gaps.sellerPostalAddress");
      case "buyerEmail":
        return t("Invoices.downloads.gaps.buyerEmail");
      case "buyerPostalAddress":
        return t("Invoices.downloads.gaps.buyerPostalAddress");
    }
  };

  const download = (format: "pdf" | "xrechnung") =>
    runUserAction(async () => {
      setIsDownloading(true);
      try {
        const response = await fetch(`/api/v1/invoices/${invoice.id}/${format}?locale=${locale}`);
        if (!response.ok) {
          toast.error(t("Invoices.downloads.failed"));
          return;
        }

        saveBlob(
          await response.blob(),
          fileNameFrom(response, `${invoice.number ?? invoice.id}.${format === "pdf" ? "pdf" : "xml"}`),
        );
      } finally {
        setIsDownloading(false);
      }
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={isDownloading} size="sm" variant="secondary">
          <Download aria-hidden className="size-4" />

          {t("Invoices.downloads.trigger")}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="max-w-80">
        <DropdownMenuItem data-invoice-download="pdf" onSelect={() => download("pdf")}>
          {t("Invoices.downloads.pdf")}
        </DropdownMenuItem>

        {eInvoiceable && (
          <DropdownMenuItem
            data-invoice-download="xrechnung"
            disabled={gaps.length > 0}
            onSelect={() => download("xrechnung")}
          >
            {t("Invoices.downloads.xrechnung")}
          </DropdownMenuItem>
        )}

        {gaps.length > 0 && (
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground" data-invoice-xrechnung-gaps="">
            {t("Invoices.downloads.gapsIntro", { missing: gaps.map(gapLabel).join(", ") })}
          </DropdownMenuLabel>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
