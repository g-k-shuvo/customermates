import type { Validated } from "@/core/validation/validation.utils";
import type { InvoiceBuyer, InvoiceRepo, OrganizationForInvoice } from "../invoice.repo";

import { z } from "zod";
import { InvoiceStatus } from "@/generated/prisma";

import {
  type CreateInvoiceData,
  CreateInvoiceSchema,
  type InvoiceDto,
  InvoiceDtoSchema,
  type InvoiceIdData,
  InvoiceIdSchema,
  type UpdateInvoiceData,
  UpdateInvoiceSchema,
} from "../invoice.schema";
import { INVOICE_CREATE, INVOICE_DELETE, INVOICE_UPDATE } from "../invoice-access";
import { invoiceLinesFromDeal } from "../invoice-lines-from-deal";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { failConflict, failNotFound } from "@/core/validation/interactor-failure-server";

function buyerFrom(
  data: Partial<InvoiceBuyer> & { buyerVatId?: string | null; buyerEmail?: string | null },
  organization: OrganizationForInvoice | null,
): InvoiceBuyer {
  const billing = organization?.billing ?? null;

  return {
    buyerName: data.buyerName ?? (billing?.legalName || organization?.name || ""),
    buyerAddress: data.buyerAddress ?? billing?.address ?? "",
    buyerVatId: data.buyerVatId ?? billing?.vatId ?? null,
    buyerEmail: data.buyerEmail ?? billing?.email ?? null,
  };
}

@TenantInteractor(INVOICE_CREATE)
export class CreateInvoiceInteractor extends AuthenticatedInteractor<CreateInvoiceData, InvoiceDto> {
  constructor(private repo: InvoiceRepo) {
    super();
  }

  @Write({ input: CreateInvoiceSchema, output: InvoiceDtoSchema })
  async invoke(data: CreateInvoiceData): Validated<InvoiceDto> {
    const deal = data.dealId ? await this.repo.findDealForInvoiceOrNull(data.dealId) : null;
    if (data.dealId && !deal) return failNotFound(CustomErrorCode.dealNotFound, ["dealId"]);

    const organization = data.organizationId
      ? await this.repo.findOrganizationForInvoiceOrNull(data.organizationId)
      : (deal?.organization ?? null);
    if (data.organizationId && !organization)
      return failNotFound(CustomErrorCode.organizationNotFound, ["organizationId"]);

    const settings = await this.repo.getSettings();
    const id = await this.repo.createDraft({
      dealId: deal?.id ?? null,
      organizationId: organization?.id ?? null,
      currency: data.currency ?? settings.currency,
      buyer: buyerFrom(data, organization),
      notes: data.notes ?? null,
      lines: data.lines ?? (deal ? invoiceLinesFromDeal(deal, settings.defaultTaxRate) : []),
    });

    return { ok: true as const, data: (await this.repo.findInvoiceOrNull(id)) as InvoiceDto };
  }
}

@TenantInteractor(INVOICE_UPDATE)
export class UpdateInvoiceInteractor extends AuthenticatedInteractor<UpdateInvoiceData, InvoiceDto> {
  constructor(private repo: InvoiceRepo) {
    super();
  }

  @Write({ input: UpdateInvoiceSchema, output: InvoiceDtoSchema })
  async invoke(data: UpdateInvoiceData): Validated<InvoiceDto> {
    const invoice = await this.repo.findInvoiceOrNull(data.id);
    if (!invoice) return failNotFound(CustomErrorCode.invoiceNotFound, ["id"]);
    if (invoice.status !== InvoiceStatus.draft) return failConflict(CustomErrorCode.invoiceNotDraft, ["id"]);

    if (data.organizationId && !(await this.repo.findOrganizationForInvoiceOrNull(data.organizationId)))
      return failNotFound(CustomErrorCode.organizationNotFound, ["organizationId"]);

    const { id, lines, ...fields } = data;
    await this.repo.updateDraft(id, fields, lines);

    return { ok: true as const, data: (await this.repo.findInvoiceOrNull(id)) as InvoiceDto };
  }
}

const DeleteInvoiceResultSchema = z.object({ id: z.uuid() });

@TenantInteractor(INVOICE_DELETE)
export class DeleteInvoiceInteractor extends AuthenticatedInteractor<InvoiceIdData, { id: string }> {
  constructor(private repo: InvoiceRepo) {
    super();
  }

  @Write({ input: InvoiceIdSchema, output: DeleteInvoiceResultSchema })
  async invoke(data: InvoiceIdData): Validated<{ id: string }> {
    const invoice = await this.repo.findInvoiceOrNull(data.id);
    if (!invoice) return failNotFound(CustomErrorCode.invoiceNotFound, ["id"]);
    if (!(await this.repo.deleteDraft(data.id))) return failConflict(CustomErrorCode.invoiceNotDraft, ["id"]);

    return { ok: true as const, data: { id: data.id } };
  }
}
