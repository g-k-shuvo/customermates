import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Currency, InvoiceStatus } from "@/generated/prisma";

import { zx } from "@/core/validation/validation.utils";

export const MAX_INVOICE_LINES = 200;
export const INVOICE_PAGE_SIZE = 50;

const money = z.number().finite().min(0).max(1_000_000_000);
const percent = z.number().finite().min(0).max(100);
const optionalText = (max: number) => z.string().trim().max(max).nullish();

export const InvoiceLineInputSchema = z.object({
  description: zx.nonBlankText(500),
  quantity: z.number().finite().gt(0).max(1_000_000),
  unitPrice: money,
  discountPercent: percent.optional().default(0),
  taxRate: percent,
  serviceId: z.uuid().nullish(),
});
export type InvoiceLineInput = Data<typeof InvoiceLineInputSchema>;

const BuyerFields = {
  buyerName: z.string().trim().max(200).optional(),
  buyerAddress: z.string().trim().max(1000).optional(),
  buyerVatId: optionalText(64),
  buyerEmail: z.email().nullish(),
};

export const CreateInvoiceSchema = z.object({
  dealId: z.uuid().optional(),
  organizationId: z.uuid().optional(),
  currency: z.enum(Currency).optional(),
  lines: z.array(InvoiceLineInputSchema).max(MAX_INVOICE_LINES).optional(),
  notes: optionalText(4000),
  ...BuyerFields,
});
export type CreateInvoiceData = Data<typeof CreateInvoiceSchema>;

export const UpdateInvoiceSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid().nullish(),
  currency: z.enum(Currency).optional(),
  dueDate: z.coerce.date().nullish(),
  lines: z.array(InvoiceLineInputSchema).max(MAX_INVOICE_LINES).optional(),
  notes: optionalText(4000),
  ...BuyerFields,
});
export type UpdateInvoiceData = Data<typeof UpdateInvoiceSchema>;

export const InvoiceIdSchema = z.object({ id: z.uuid() });
export type InvoiceIdData = Data<typeof InvoiceIdSchema>;

export const IssueInvoiceSchema = z.object({ id: z.uuid(), issueDate: z.coerce.date().optional() });
export type IssueInvoiceData = Data<typeof IssueInvoiceSchema>;

export const RecordInvoicePaymentSchema = z.object({
  id: z.uuid(),
  amount: z.number().finite().gt(0).max(1_000_000_000),
  paidAt: z.coerce.date().optional(),
  note: optionalText(500),
});
export type RecordInvoicePaymentData = Data<typeof RecordInvoicePaymentSchema>;

export const DeleteInvoicePaymentSchema = z.object({ id: z.uuid(), paymentId: z.uuid() });
export type DeleteInvoicePaymentData = Data<typeof DeleteInvoicePaymentSchema>;

export const GetInvoicesSchema = z.object({
  status: z.enum(InvoiceStatus).optional(),
  dealId: z.uuid().optional(),
  organizationId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).optional(),
});
export type GetInvoicesData = Data<typeof GetInvoicesSchema>;

export const SellerSnapshotSchema = z.object({
  name: z.string(),
  address: z.string(),
  vatId: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable().optional(),
  bankDetails: z.string().nullable(),
  footer: z.string().nullable(),
});
export type SellerSnapshot = Data<typeof SellerSnapshotSchema>;

export const InvoiceLineDtoSchema = z.object({
  id: z.uuid(),
  position: z.number().int(),
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  discountPercent: z.number(),
  taxRate: z.number(),
  netAmount: z.number(),
  taxAmount: z.number(),
  serviceId: z.uuid().nullable(),
});
export type InvoiceLineDto = Data<typeof InvoiceLineDtoSchema>;

export const InvoicePaymentDtoSchema = z.object({
  id: z.uuid(),
  amount: z.number(),
  paidAt: z.date(),
  note: z.string().nullable(),
});

const RelatedRecord = z.object({ id: z.uuid(), name: z.string() }).nullable();

export const InvoiceSummaryDtoSchema = z.object({
  id: z.uuid(),
  number: z.string().nullable(),
  status: z.enum(InvoiceStatus),
  deal: RelatedRecord,
  organization: RelatedRecord,
  currency: z.enum(Currency),
  buyerName: z.string(),
  issueDate: z.date().nullable(),
  dueDate: z.date().nullable(),
  grossTotal: z.number(),
  paidAmount: z.number(),
  balance: z.number(),
  overdue: z.boolean(),
  createdAt: z.date(),
});
export type InvoiceSummaryDto = Data<typeof InvoiceSummaryDtoSchema>;

export const InvoiceDtoSchema = InvoiceSummaryDtoSchema.extend({
  buyerAddress: z.string(),
  buyerVatId: z.string().nullable(),
  buyerEmail: z.string().nullable(),
  notes: z.string().nullable(),
  netTotal: z.number(),
  taxTotal: z.number(),
  taxBreakdown: z.array(z.object({ taxRate: z.number(), netAmount: z.number(), taxAmount: z.number() })),
  paidAt: z.date().nullable(),
  issuedAt: z.date().nullable(),
  voidedAt: z.date().nullable(),
  seller: SellerSnapshotSchema.nullable(),
  lines: z.array(InvoiceLineDtoSchema),
  payments: z.array(InvoicePaymentDtoSchema),
  updatedAt: z.date(),
});
export type InvoiceDto = Data<typeof InvoiceDtoSchema>;

export const InvoiceListDtoSchema = z.object({
  items: z.array(InvoiceSummaryDtoSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type InvoiceListDto = Data<typeof InvoiceListDtoSchema>;

export const InvoiceSettingsDtoSchema = z.object({
  sellerName: z.string(),
  sellerAddress: z.string(),
  sellerVatId: z.string().nullable(),
  sellerEmail: z.string().nullable(),
  sellerPhone: z.string().nullable(),
  bankDetails: z.string().nullable(),
  footer: z.string().nullable(),
  numberPrefix: z.string(),
  nextNumber: z.number().int(),
  paymentTermsDays: z.number().int(),
  defaultTaxRate: z.number(),
  currency: z.enum(Currency),
});
export type InvoiceSettingsDto = Data<typeof InvoiceSettingsDtoSchema>;

export const UpdateInvoiceSettingsSchema = z.object({
  sellerName: z.string().trim().max(200).optional(),
  sellerAddress: z.string().trim().max(1000).optional(),
  sellerVatId: optionalText(64),
  sellerEmail: z.email().nullish(),
  sellerPhone: optionalText(40),
  bankDetails: optionalText(1000),
  footer: optionalText(1000),
  numberPrefix: z.string().trim().max(20).optional(),
  nextNumber: z.number().int().min(1).max(99_999_999).optional(),
  paymentTermsDays: z.number().int().min(0).max(365).optional(),
  defaultTaxRate: percent.optional(),
});
export type UpdateInvoiceSettingsData = Data<typeof UpdateInvoiceSettingsSchema>;

export const BillingProfileDtoSchema = z.object({
  organizationId: z.uuid(),
  legalName: z.string(),
  address: z.string(),
  vatId: z.string().nullable(),
  email: z.string().nullable(),
});
export type BillingProfileDto = Data<typeof BillingProfileDtoSchema>;

export const OrganizationIdSchema = z.object({ organizationId: z.uuid() });
export type OrganizationIdData = Data<typeof OrganizationIdSchema>;

export const UpsertBillingProfileSchema = z.object({
  organizationId: z.uuid(),
  legalName: z.string().trim().max(200),
  address: z.string().trim().max(1000),
  vatId: optionalText(64),
  email: z.email().nullish(),
});
export type UpsertBillingProfileData = Data<typeof UpsertBillingProfileSchema>;
