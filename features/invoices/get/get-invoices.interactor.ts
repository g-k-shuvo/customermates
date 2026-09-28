import type { Validated } from "@/core/validation/validation.utils";
import type { InvoiceRepo } from "../invoice.repo";

import {
  type GetInvoicesData,
  GetInvoicesSchema,
  INVOICE_PAGE_SIZE,
  type InvoiceDto,
  InvoiceDtoSchema,
  type InvoiceIdData,
  InvoiceIdSchema,
  type InvoiceListDto,
  InvoiceListDtoSchema,
} from "../invoice.schema";
import { INVOICE_READ } from "../invoice-access";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { failNotFound } from "@/core/validation/interactor-failure-server";

@AllowInDemoMode
@TenantInteractor(INVOICE_READ)
export class GetInvoicesInteractor extends AuthenticatedInteractor<GetInvoicesData, InvoiceListDto> {
  constructor(private repo: InvoiceRepo) {
    super();
  }

  @Validate(GetInvoicesSchema)
  @ValidateOutput(InvoiceListDtoSchema)
  async invoke(data: GetInvoicesData): Validated<InvoiceListDto> {
    const page = data.page ?? 1;
    const { items, total } = await this.repo.listInvoices({
      status: data.status,
      dealId: data.dealId,
      organizationId: data.organizationId,
      skip: (page - 1) * INVOICE_PAGE_SIZE,
      take: INVOICE_PAGE_SIZE,
    });

    return { ok: true as const, data: { items, total, page, pageSize: INVOICE_PAGE_SIZE } };
  }
}

@AllowInDemoMode
@TenantInteractor(INVOICE_READ)
export class GetInvoiceInteractor extends AuthenticatedInteractor<InvoiceIdData, InvoiceDto> {
  constructor(private repo: InvoiceRepo) {
    super();
  }

  @Validate(InvoiceIdSchema)
  @ValidateOutput(InvoiceDtoSchema)
  async invoke(data: InvoiceIdData): Validated<InvoiceDto> {
    const invoice = await this.repo.findInvoiceOrNull(data.id);
    if (!invoice) return failNotFound(CustomErrorCode.invoiceNotFound, ["id"]);

    return { ok: true as const, data: invoice };
  }
}
