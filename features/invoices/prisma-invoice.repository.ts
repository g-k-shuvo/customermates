import type { Prisma } from "@/generated/prisma";
import type { DealForInvoice, DraftFields, InvoiceBuyer, InvoiceRepo, OrganizationForInvoice } from "./invoice.repo";
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

import { Currency, InvoiceStatus } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { balanceDue, formatInvoiceNumber, invoiceTotals, lineTotals } from "./invoice-totals";

type DecimalLike = { toString(): string };

const toNumber = (value: DecimalLike | number | null | undefined) =>
  value === null || value === undefined ? 0 : Number(value.toString());

const SUMMARY_SELECT = {
  id: true,
  number: true,
  status: true,
  currency: true,
  buyerName: true,
  issueDate: true,
  dueDate: true,
  grossTotal: true,
  paidAmount: true,
  createdAt: true,
  deal: { select: { id: true, name: true } },
  organization: { select: { id: true, name: true } },
} as const;

const DETAIL_SELECT = {
  ...SUMMARY_SELECT,
  buyerAddress: true,
  buyerVatId: true,
  buyerEmail: true,
  notes: true,
  netTotal: true,
  taxTotal: true,
  paidAt: true,
  issuedAt: true,
  voidedAt: true,
  sellerSnapshot: true,
  updatedAt: true,
  lines: {
    select: {
      id: true,
      position: true,
      description: true,
      quantity: true,
      unitPrice: true,
      discountPercent: true,
      taxRate: true,
      netAmount: true,
      taxAmount: true,
      serviceId: true,
    },
    orderBy: { position: "asc" as const },
  },
  payments: { select: { id: true, amount: true, paidAt: true, note: true }, orderBy: { paidAt: "asc" as const } },
} as const;

const BILLING_SELECT = { organizationId: true, legalName: true, address: true, vatId: true, email: true } as const;

type SummaryRow = Prisma.InvoiceGetPayload<{ select: typeof SUMMARY_SELECT }>;
type DetailRow = Prisma.InvoiceGetPayload<{ select: typeof DETAIL_SELECT }>;

function startOfToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function toSummary(row: SummaryRow): InvoiceSummaryDto {
  const grossTotal = toNumber(row.grossTotal);
  const paidAmount = toNumber(row.paidAmount);
  const balance = row.status === InvoiceStatus.void ? 0 : balanceDue(grossTotal, paidAmount);

  return {
    id: row.id,
    number: row.number,
    status: row.status,
    deal: row.deal,
    organization: row.organization,
    currency: row.currency,
    buyerName: row.buyerName,
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    grossTotal,
    paidAmount,
    balance,
    overdue: row.status === InvoiceStatus.issued && balance > 0 && row.dueDate !== null && row.dueDate < startOfToday(),
    createdAt: row.createdAt,
  };
}

function toDetail(row: DetailRow): InvoiceDto {
  const lines = row.lines.map((line) => ({
    id: line.id,
    position: line.position,
    description: line.description,
    quantity: toNumber(line.quantity),
    unitPrice: toNumber(line.unitPrice),
    discountPercent: toNumber(line.discountPercent),
    taxRate: toNumber(line.taxRate),
    netAmount: toNumber(line.netAmount),
    taxAmount: toNumber(line.taxAmount),
    serviceId: line.serviceId,
  }));

  return {
    ...toSummary(row),
    buyerAddress: row.buyerAddress,
    buyerVatId: row.buyerVatId,
    buyerEmail: row.buyerEmail,
    notes: row.notes,
    netTotal: toNumber(row.netTotal),
    taxTotal: toNumber(row.taxTotal),
    taxBreakdown: invoiceTotals(lines).taxBreakdown,
    paidAt: row.paidAt,
    issuedAt: row.issuedAt,
    voidedAt: row.voidedAt,
    seller: (row.sellerSnapshot as SellerSnapshot | null) ?? null,
    lines,
    payments: row.payments.map((payment) => ({ ...payment, amount: toNumber(payment.amount) })),
    updatedAt: row.updatedAt,
  };
}

export class PrismaInvoiceRepo extends BaseRepository implements InvoiceRepo {
  async listInvoices(args: {
    status?: InvoiceStatus;
    dealId?: string;
    organizationId?: string;
    skip: number;
    take: number;
  }) {
    const where = {
      companyId: this.companyId,
      ...(args.status ? { status: args.status } : {}),
      ...(args.dealId ? { dealId: args.dealId } : {}),
      ...(args.organizationId ? { organizationId: args.organizationId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        select: SUMMARY_SELECT,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: args.skip,
        take: args.take,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return { items: rows.map(toSummary), total };
  }

  async findInvoiceOrNull(id: string) {
    const row = await this.prisma.invoice.findFirst({
      where: { id, companyId: this.companyId },
      select: DETAIL_SELECT,
    });

    return row ? toDetail(row) : null;
  }

  async findDealForInvoiceOrNull(dealId: string): Promise<DealForInvoice | null> {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, ...this.accessWhere("deal") },
      select: {
        id: true,
        name: true,
        baseValue: true,
        services: { select: { quantity: true, service: { select: { id: true, name: true, amount: true } } } },
        organizations: {
          select: { organization: { select: { id: true, name: true, billingProfile: { select: BILLING_SELECT } } } },
          take: 1,
        },
      },
    });
    if (!deal) return null;

    const organization = deal.organizations[0]?.organization ?? null;

    return {
      id: deal.id,
      name: deal.name,
      baseValue: deal.baseValue,
      services: deal.services.map((entry) => ({
        serviceId: entry.service.id,
        name: entry.service.name,
        amount: entry.service.amount,
        quantity: entry.quantity,
      })),
      organization: organization
        ? { id: organization.id, name: organization.name, billing: organization.billingProfile }
        : null,
    };
  }

  async findOrganizationForInvoiceOrNull(organizationId: string): Promise<OrganizationForInvoice | null> {
    const organization = await this.prisma.organization.findFirst({
      where: { id: organizationId, ...this.accessWhere("organization") },
      select: { id: true, name: true, billingProfile: { select: BILLING_SELECT } },
    });

    return organization ? { id: organization.id, name: organization.name, billing: organization.billingProfile } : null;
  }

  async getSettings(): Promise<InvoiceSettingsDto> {
    const [settings, company] = await Promise.all([
      this.prisma.invoiceSettings.findUnique({ where: { companyId: this.companyId } }),
      this.prisma.company.findUnique({ where: { id: this.companyId }, select: { currency: true } }),
    ]);

    return {
      sellerName: settings?.sellerName ?? "",
      sellerAddress: settings?.sellerAddress ?? "",
      sellerVatId: settings?.sellerVatId ?? null,
      sellerEmail: settings?.sellerEmail ?? null,
      sellerPhone: settings?.sellerPhone ?? null,
      bankDetails: settings?.bankDetails ?? null,
      footer: settings?.footer ?? null,
      numberPrefix: settings?.numberPrefix ?? "INV-",
      nextNumber: settings?.nextNumber ?? 1,
      paymentTermsDays: settings?.paymentTermsDays ?? 14,
      defaultTaxRate: settings ? toNumber(settings.defaultTaxRate) : 19,
      currency: company?.currency ?? Currency.eur,
    };
  }

  async updateSettings(data: UpdateInvoiceSettingsData) {
    await this.prisma.invoiceSettings.upsert({
      where: { companyId: this.companyId },
      create: { companyId: this.companyId, ...data },
      update: { ...data, companyId: this.companyId },
    });

    return this.getSettings();
  }

  private lineRows(invoiceId: string, lines: readonly InvoiceLineInput[]) {
    return lines.map((line, position) => ({
      companyId: this.companyId,
      invoiceId,
      position,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountPercent: line.discountPercent,
      taxRate: line.taxRate,
      serviceId: line.serviceId ?? null,
      ...lineTotals(line),
    }));
  }

  private totalsOf(lines: readonly InvoiceLineInput[]) {
    const { netTotal, taxTotal, grossTotal } = invoiceTotals(lines);

    return { netTotal, taxTotal, grossTotal };
  }

  async createDraft(args: {
    dealId: string | null;
    organizationId: string | null;
    currency: Currency;
    buyer: InvoiceBuyer;
    notes: string | null;
    lines: readonly InvoiceLineInput[];
  }) {
    const invoice = await this.prisma.invoice.create({
      data: {
        companyId: this.companyId,
        dealId: args.dealId,
        organizationId: args.organizationId,
        currency: args.currency,
        ...args.buyer,
        notes: args.notes,
        createdByUserId: this.userId,
        ...this.totalsOf(args.lines),
      },
      select: { id: true },
    });

    if (args.lines.length > 0)
      await this.prisma.invoiceLine.createMany({ data: this.lineRows(invoice.id, args.lines) });

    return invoice.id;
  }

  async updateDraft(id: string, fields: DraftFields, lines: readonly InvoiceLineInput[] | undefined) {
    const data = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));

    if (lines) {
      await this.prisma.invoiceLine.deleteMany({ where: { companyId: this.companyId, invoiceId: id } });
      if (lines.length > 0) await this.prisma.invoiceLine.createMany({ data: this.lineRows(id, lines) });
    }

    await this.prisma.invoice.updateMany({
      where: { id, companyId: this.companyId, status: InvoiceStatus.draft },
      data: { ...data, ...(lines ? this.totalsOf(lines) : {}) },
    });
  }

  async allocateInvoiceNumber() {
    const settings = await this.prisma.invoiceSettings.upsert({
      where: { companyId: this.companyId },
      create: { companyId: this.companyId, nextNumber: 2 },
      update: { companyId: this.companyId, nextNumber: { increment: 1 } },
      select: { nextNumber: true, numberPrefix: true },
    });

    return formatInvoiceNumber(settings.numberPrefix, settings.nextNumber - 1);
  }

  async markIssued(args: { id: string; number: string; issueDate: Date; dueDate: Date; seller: SellerSnapshot }) {
    const updated = await this.prisma.invoice.updateMany({
      where: { id: args.id, companyId: this.companyId, status: InvoiceStatus.draft },
      data: {
        status: InvoiceStatus.issued,
        number: args.number,
        issueDate: args.issueDate,
        dueDate: args.dueDate,
        issuedAt: new Date(),
        sellerSnapshot: args.seller as Prisma.InputJsonValue,
      },
    });

    return updated.count > 0;
  }

  async addPayment(args: { id: string; amount: number; paidAt: Date; note: string | null }) {
    await this.prisma.invoicePayment.create({
      data: {
        companyId: this.companyId,
        invoiceId: args.id,
        amount: args.amount,
        paidAt: args.paidAt,
        note: args.note,
        createdByUserId: this.userId,
      },
    });

    const [invoice, paid] = await Promise.all([
      this.prisma.invoice.findFirst({
        where: { id: args.id, companyId: this.companyId },
        select: { grossTotal: true },
      }),
      this.prisma.invoicePayment.aggregate({
        where: { companyId: this.companyId, invoiceId: args.id },
        _sum: { amount: true },
      }),
    ]);
    if (!invoice) return;

    const paidAmount = toNumber(paid._sum.amount);
    const settled = balanceDue(toNumber(invoice.grossTotal), paidAmount) <= 0;

    await this.prisma.invoice.updateMany({
      where: { id: args.id, companyId: this.companyId },
      data: {
        paidAmount,
        ...(settled ? { status: InvoiceStatus.paid, paidAt: args.paidAt } : {}),
      },
    });
  }

  async markVoid(id: string) {
    const updated = await this.prisma.invoice.updateMany({
      where: { id, companyId: this.companyId, status: InvoiceStatus.issued },
      data: { status: InvoiceStatus.void, voidedAt: new Date() },
    });

    return updated.count > 0;
  }

  async deleteDraft(id: string) {
    const deleted = await this.prisma.invoice.deleteMany({
      where: { id, companyId: this.companyId, status: InvoiceStatus.draft },
    });

    return deleted.count > 0;
  }

  async findBillingProfileOrNull(organizationId: string): Promise<BillingProfileDto | null> {
    return this.prisma.billingProfile.findFirst({
      where: { companyId: this.companyId, organizationId },
      select: BILLING_SELECT,
    });
  }

  async upsertBillingProfile(data: UpsertBillingProfileData): Promise<BillingProfileDto> {
    const fields = {
      legalName: data.legalName,
      address: data.address,
      vatId: data.vatId ?? null,
      email: data.email ?? null,
    };

    return this.prisma.billingProfile.upsert({
      where: { organizationId: data.organizationId, companyId: this.companyId },
      create: { companyId: this.companyId, organizationId: data.organizationId, ...fields },
      update: { ...fields, companyId: this.companyId },
      select: BILLING_SELECT,
    });
  }
}
