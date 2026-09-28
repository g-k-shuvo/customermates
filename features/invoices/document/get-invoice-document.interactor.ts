import type { Data, Validated } from "@/core/validation/validation.utils";
import type { AppLocale } from "@/i18n/locale-registry";
import type { InvoiceRepo } from "../invoice.repo";
import type { InvoiceDto } from "../invoice.schema";

import { z } from "zod";
import { InvoiceStatus } from "@/generated/prisma";

import { INVOICE_READ } from "../invoice-access";

import { renderInvoicePdf } from "./invoice-pdf";
import { buildXRechnung, xRechnungGaps } from "./xrechnung";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { fail, failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { getTranslator } from "@/i18n/get-translator";
import { APP_LOCALES, formattingTagFor } from "@/i18n/locale-registry";
import { resolveUserLocale } from "@/i18n/user-locale";

export const INVOICE_DOCUMENT_FORMATS = ["pdf", "xrechnung"] as const;

const [firstLocale, ...otherLocales] = APP_LOCALES;

export const GetInvoiceDocumentSchema = z.object({
  id: z.uuid(),
  format: z.enum(INVOICE_DOCUMENT_FORMATS),
  locale: z.enum([firstLocale, ...otherLocales]).optional(),
});
export type GetInvoiceDocumentData = Data<typeof GetInvoiceDocumentSchema>;

export type InvoiceDocument = { fileName: string; contentType: string; body: Uint8Array };

function fileStem(invoice: InvoiceDto): string {
  return (invoice.number ?? `draft-${invoice.id.slice(0, 8)}`).replace(/[^A-Za-z0-9._-]+/g, "-");
}

async function renderPdf(invoice: InvoiceDto, locale: AppLocale): Promise<Uint8Array> {
  const t = await getTranslator(locale, "InvoiceDocument");
  const tag = formattingTagFor(locale);
  const currency = new Intl.NumberFormat(tag, { style: "currency", currency: invoice.currency.toUpperCase() });
  const number = new Intl.NumberFormat(tag, { maximumFractionDigits: 3 });
  const date = new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeZone: "UTC" });

  const pdf = await renderInvoicePdf(
    invoice,
    {
      title: t("title"),
      draftTitle: t("draftTitle"),
      number: t("number"),
      issueDate: t("issueDate"),
      dueDate: t("dueDate"),
      buyerVatId: t("buyerVatId"),
      position: t("position"),
      description: t("description"),
      quantity: t("quantity"),
      unitPrice: t("unitPrice"),
      discount: t("discount"),
      taxRate: t("taxRate"),
      net: t("net"),
      netTotal: t("netTotal"),
      taxAtRate: (rate) => t("taxAtRate", { rate }),
      grossTotal: t("grossTotal"),
      paid: t("paid"),
      balance: t("balance"),
      payableBy: (value) => t("payableBy", { date: value }),
      bankDetails: t("bankDetails"),
      vatId: t("vatId"),
      draftMark: t("draftMark"),
      voidMark: t("voidMark"),
    },
    {
      money: (amount) => currency.format(amount),
      number: (value) => number.format(value),
      date: (value) => date.format(value),
    },
  );

  return new Uint8Array(pdf);
}

@AllowInDemoMode
@TenantInteractor(INVOICE_READ)
export class GetInvoiceDocumentInteractor extends AuthenticatedInteractor<GetInvoiceDocumentData, InvoiceDocument> {
  constructor(private repo: InvoiceRepo) {
    super();
  }

  @Validate(GetInvoiceDocumentSchema)
  async invoke(data: GetInvoiceDocumentData): Validated<InvoiceDocument> {
    const invoice = await this.repo.findInvoiceOrNull(data.id);
    if (!invoice) return failNotFound(CustomErrorCode.invoiceNotFound, ["id"]);

    const locale = data.locale ?? resolveUserLocale(this.user);

    if (data.format === "pdf") {
      return {
        ok: true as const,
        data: {
          fileName: `${fileStem(invoice)}.pdf`,
          contentType: "application/pdf",
          body: await renderPdf(invoice, locale),
        },
      };
    }

    if (invoice.status !== InvoiceStatus.issued && invoice.status !== InvoiceStatus.paid)
      return failConflict(CustomErrorCode.invoiceNotIssued, ["id"]);
    if (xRechnungGaps(invoice).length > 0) return fail(CustomErrorCode.invoiceXRechnungIncomplete, ["id"]);

    const t = await getTranslator(locale, "InvoiceDocument");
    const date = new Intl.DateTimeFormat(formattingTagFor(locale), { dateStyle: "medium", timeZone: "UTC" });
    const xml = buildXRechnung(invoice, {
      discount: t("discount"),
      payableBy: (value) => t("payableBy", { date: date.format(value) }),
    });

    return {
      ok: true as const,
      data: {
        fileName: `${fileStem(invoice)}-xrechnung.xml`,
        contentType: "application/xml",
        body: new TextEncoder().encode(xml),
      },
    };
  }
}
