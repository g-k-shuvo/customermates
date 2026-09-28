import type { Validated } from "@/core/validation/validation.utils";
import type { InvoiceRepo } from "../invoice.repo";

import { addDays } from "date-fns";
import { InvoiceStatus } from "@/generated/prisma";

import {
  type InvoiceDto,
  InvoiceDtoSchema,
  type InvoiceIdData,
  InvoiceIdSchema,
  type IssueInvoiceData,
  IssueInvoiceSchema,
  type RecordInvoicePaymentData,
  RecordInvoicePaymentSchema,
} from "../invoice.schema";
import { INVOICE_UPDATE } from "../invoice-access";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { fail, failConflict, failNotFound } from "@/core/validation/interactor-failure-server";

@TenantInteractor(INVOICE_UPDATE)
export class IssueInvoiceInteractor extends AuthenticatedInteractor<IssueInvoiceData, InvoiceDto> {
  constructor(private repo: InvoiceRepo) {
    super();
  }

  @Write({ input: IssueInvoiceSchema, output: InvoiceDtoSchema })
  async invoke(data: IssueInvoiceData): Validated<InvoiceDto> {
    const invoice = await this.repo.findInvoiceOrNull(data.id);
    if (!invoice) return failNotFound(CustomErrorCode.invoiceNotFound, ["id"]);
    if (invoice.status !== InvoiceStatus.draft) return failConflict(CustomErrorCode.invoiceNotDraft, ["id"]);
    if (invoice.lines.length === 0) return fail(CustomErrorCode.invoiceHasNoLines, ["id"]);

    const settings = await this.repo.getSettings();
    if (!settings.sellerName.trim() || !settings.sellerAddress.trim())
      return fail(CustomErrorCode.invoiceSellerMissing, ["id"]);

    const issueDate = data.issueDate ?? new Date();
    const number = await this.repo.allocateInvoiceNumber();
    const issued = await this.repo.markIssued({
      id: invoice.id,
      number,
      issueDate,
      dueDate: invoice.dueDate ?? addDays(issueDate, settings.paymentTermsDays),
      seller: {
        name: settings.sellerName,
        address: settings.sellerAddress,
        vatId: settings.sellerVatId,
        email: settings.sellerEmail,
        phone: settings.sellerPhone,
        bankDetails: settings.bankDetails,
        footer: settings.footer,
      },
    });
    if (!issued) return failConflict(CustomErrorCode.invoiceNotDraft, ["id"]);

    return { ok: true as const, data: (await this.repo.findInvoiceOrNull(invoice.id)) as InvoiceDto };
  }
}

@TenantInteractor(INVOICE_UPDATE)
export class RecordInvoicePaymentInteractor extends AuthenticatedInteractor<RecordInvoicePaymentData, InvoiceDto> {
  constructor(private repo: InvoiceRepo) {
    super();
  }

  @Write({ input: RecordInvoicePaymentSchema, output: InvoiceDtoSchema })
  async invoke(data: RecordInvoicePaymentData): Validated<InvoiceDto> {
    const invoice = await this.repo.findInvoiceOrNull(data.id);
    if (!invoice) return failNotFound(CustomErrorCode.invoiceNotFound, ["id"]);
    if (invoice.status !== InvoiceStatus.issued) return failConflict(CustomErrorCode.invoiceNotIssued, ["id"]);
    if (Math.round(data.amount * 100) > Math.round(invoice.balance * 100))
      return fail(CustomErrorCode.invoicePaymentExceedsBalance, ["amount"]);

    await this.repo.addPayment({
      id: invoice.id,
      amount: data.amount,
      paidAt: data.paidAt ?? new Date(),
      note: data.note ?? null,
    });

    return { ok: true as const, data: (await this.repo.findInvoiceOrNull(invoice.id)) as InvoiceDto };
  }
}

@TenantInteractor(INVOICE_UPDATE)
export class VoidInvoiceInteractor extends AuthenticatedInteractor<InvoiceIdData, InvoiceDto> {
  constructor(private repo: InvoiceRepo) {
    super();
  }

  @Write({ input: InvoiceIdSchema, output: InvoiceDtoSchema })
  async invoke(data: InvoiceIdData): Validated<InvoiceDto> {
    const invoice = await this.repo.findInvoiceOrNull(data.id);
    if (!invoice) return failNotFound(CustomErrorCode.invoiceNotFound, ["id"]);
    if (!(await this.repo.markVoid(invoice.id))) return failConflict(CustomErrorCode.invoiceNotIssued, ["id"]);

    return { ok: true as const, data: (await this.repo.findInvoiceOrNull(invoice.id)) as InvoiceDto };
  }
}
