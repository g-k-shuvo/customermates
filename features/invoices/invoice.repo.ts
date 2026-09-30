import type { Currency, InvoiceStatus } from "@/generated/prisma";
import type {
  BillingProfileDto,
  InvoiceDto,
  InvoiceLineInput,
  InvoiceSettingsDto,
  InvoiceSummaryDto,
  SellerSnapshot,
  UpdateInvoiceSettingsData,
  UpsertBillingProfileData,
} from "./invoice.schema";

export type InvoiceBuyer = {
  buyerName: string;
  buyerAddress: string;
  buyerVatId: string | null;
  buyerEmail: string | null;
};

export type DealForInvoice = {
  id: string;
  name: string;
  baseValue: number;
  services: Array<{ serviceId: string; name: string; amount: number; quantity: number }>;
  organization: { id: string; name: string; billing: BillingProfileDto | null } | null;
};

export type OrganizationForInvoice = { id: string; name: string; billing: BillingProfileDto | null };

export type DraftFields = Partial<InvoiceBuyer> & {
  organizationId?: string | null;
  currency?: Currency;
  dueDate?: Date | null;
  notes?: string | null;
};

export abstract class InvoiceRepo {
  abstract listInvoices(args: {
    status?: InvoiceStatus;
    dealId?: string;
    organizationId?: string;
    skip: number;
    take: number;
  }): Promise<{ items: InvoiceSummaryDto[]; total: number }>;
  abstract findInvoiceOrNull(id: string): Promise<InvoiceDto | null>;
  abstract findDealForInvoiceOrNull(dealId: string): Promise<DealForInvoice | null>;
  abstract findOrganizationForInvoiceOrNull(organizationId: string): Promise<OrganizationForInvoice | null>;
  abstract getSettings(): Promise<InvoiceSettingsDto>;
  abstract updateSettings(data: UpdateInvoiceSettingsData): Promise<InvoiceSettingsDto>;
  abstract createDraft(args: {
    dealId: string | null;
    organizationId: string | null;
    currency: Currency;
    buyer: InvoiceBuyer;
    notes: string | null;
    lines: readonly InvoiceLineInput[];
  }): Promise<string>;
  abstract updateDraft(id: string, fields: DraftFields, lines: readonly InvoiceLineInput[] | undefined): Promise<void>;
  abstract allocateInvoiceNumber(): Promise<string>;
  abstract markIssued(args: {
    id: string;
    number: string;
    issueDate: Date;
    dueDate: Date;
    seller: SellerSnapshot;
  }): Promise<boolean>;
  abstract addPayment(args: { id: string; amount: number; paidAt: Date; note: string | null }): Promise<void>;
  abstract removePayment(id: string, paymentId: string): Promise<boolean>;
  abstract markVoid(id: string): Promise<boolean>;
  abstract deleteDraft(id: string): Promise<boolean>;
  abstract findBillingProfileOrNull(organizationId: string): Promise<BillingProfileDto | null>;
  abstract upsertBillingProfile(data: UpsertBillingProfileData): Promise<BillingProfileDto>;
}
