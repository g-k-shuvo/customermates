import type { Validated } from "@/core/validation/validation.utils";
import type { InvoiceRepo } from "../invoice.repo";

import {
  type BillingProfileDto,
  BillingProfileDtoSchema,
  type InvoiceSettingsDto,
  InvoiceSettingsDtoSchema,
  type OrganizationIdData,
  OrganizationIdSchema,
  type UpdateInvoiceSettingsData,
  UpdateInvoiceSettingsSchema,
  type UpsertBillingProfileData,
  UpsertBillingProfileSchema,
} from "../invoice.schema";
import { BILLING_READ, BILLING_UPDATE, INVOICE_READ, INVOICE_SETTINGS_UPDATE } from "../invoice-access";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { failNotFound } from "@/core/validation/interactor-failure-server";

@AllowInDemoMode
@TenantInteractor(INVOICE_READ)
export class GetInvoiceSettingsInteractor extends AuthenticatedInteractor<void, InvoiceSettingsDto> {
  constructor(private repo: InvoiceRepo) {
    super();
  }

  @ValidateOutput(InvoiceSettingsDtoSchema)
  async invoke(): Validated<InvoiceSettingsDto> {
    return { ok: true as const, data: await this.repo.getSettings() };
  }
}

@TenantInteractor(INVOICE_SETTINGS_UPDATE)
export class UpdateInvoiceSettingsInteractor extends AuthenticatedInteractor<
  UpdateInvoiceSettingsData,
  InvoiceSettingsDto
> {
  constructor(private repo: InvoiceRepo) {
    super();
  }

  @Write({ input: UpdateInvoiceSettingsSchema, output: InvoiceSettingsDtoSchema })
  async invoke(data: UpdateInvoiceSettingsData): Validated<InvoiceSettingsDto> {
    return { ok: true as const, data: await this.repo.updateSettings(data) };
  }
}

const EMPTY_PROFILE = { legalName: "", address: "", vatId: null, email: null };

@AllowInDemoMode
@TenantInteractor(BILLING_READ)
export class GetBillingProfileInteractor extends AuthenticatedInteractor<OrganizationIdData, BillingProfileDto> {
  constructor(private repo: InvoiceRepo) {
    super();
  }

  @Validate(OrganizationIdSchema)
  @ValidateOutput(BillingProfileDtoSchema)
  async invoke(data: OrganizationIdData): Validated<BillingProfileDto> {
    const organization = await this.repo.findOrganizationForInvoiceOrNull(data.organizationId);
    if (!organization) return failNotFound(CustomErrorCode.organizationNotFound, ["organizationId"]);

    return {
      ok: true as const,
      data: organization.billing ?? { organizationId: organization.id, ...EMPTY_PROFILE },
    };
  }
}

@TenantInteractor(BILLING_UPDATE)
export class UpsertBillingProfileInteractor extends AuthenticatedInteractor<
  UpsertBillingProfileData,
  BillingProfileDto
> {
  constructor(private repo: InvoiceRepo) {
    super();
  }

  @Write({ input: UpsertBillingProfileSchema, output: BillingProfileDtoSchema })
  async invoke(data: UpsertBillingProfileData): Validated<BillingProfileDto> {
    if (!(await this.repo.findOrganizationForInvoiceOrNull(data.organizationId)))
      return failNotFound(CustomErrorCode.organizationNotFound, ["organizationId"]);

    return { ok: true as const, data: await this.repo.upsertBillingProfile(data) };
  }
}
