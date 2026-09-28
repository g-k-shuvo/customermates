import type { ZodError } from "zod";

import { randomUUID } from "node:crypto";

import { createTranslator } from "next-intl";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import messages from "@/i18n/locales/en.json";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: (namespace?: string) =>
    Promise.resolve(createTranslator({ locale: "en", messages, namespace: namespace as never })),
}));

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "self-hosted",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
    BASE_URL: "http://localhost:4000",
    BETTER_AUTH_SECRET: "vitest-secret",
    RESEND_OPERATOR_EMAIL: "operator@example.invalid",
  },
}));

const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runAsBackgroundTenant } = await import("@/core/decorators/background-tenant");
const { serializeInteractorFailure } = await import("@/core/validation/validation.utils");
const { CustomErrorCode } = await import("@/core/validation/validation.types");
const { Action, Resource } = await import("@/generated/prisma");
const di = await import("@/core/di");

type Outcome = { ok: true; data: unknown } | { ok: false; error: ZodError };

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

const codes = (outcome: Outcome) =>
  outcome.ok ? [] : serializeInteractorFailure(outcome.error).issues.map((issue) => issue.customCode);

describeDatabase("invoices", () => {
  const companyId = randomUUID();
  let admin: string;
  let viewer: string;
  let dealId: string;

  beforeAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: companyId } });
      const adminRole = await prisma.userRole.create({
        data: { companyId, name: `Admin ${randomUUID()}`, isSystemRole: true },
        select: { id: true },
      });
      const viewerRole = await prisma.userRole.create({
        data: {
          companyId,
          name: `Viewer ${randomUUID()}`,
          permissions: { create: [{ companyId, resource: Resource.deals, action: Action.readAll }] },
        },
        select: { id: true },
      });
      const user = (roleId: string, name: string) =>
        prisma.user
          .create({
            data: {
              companyId,
              roleId,
              email: `${name}-${randomUUID()}@example.invalid`,
              firstName: name,
              lastName: "Tester",
              status: "active",
            },
            select: { id: true },
          })
          .then((row) => row.id);
      admin = await user(adminRole.id, "admin");
      viewer = await user(viewerRole.id, "viewer");

      const organization = await prisma.organization.create({
        data: {
          companyId,
          name: "Acme",
          billingProfile: {
            create: { companyId, legalName: "Acme GmbH", address: "Hauptstr. 1\n10115 Berlin", vatId: "DE123456789" },
          },
        },
        select: { id: true },
      });
      const service = await prisma.service.create({ data: { companyId, name: "Workshop day", amount: 1200 } });
      dealId = (
        await prisma.deal.create({
          data: {
            companyId,
            name: "Market study",
            baseValue: 50000,
            organizations: { create: { companyId, organizationId: organization.id } },
            services: { create: { companyId, serviceId: service.id, quantity: 2 } },
          },
          select: { id: true },
        })
      ).id;
    });
  });

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: companyId } }));
    await prisma.$disconnect();
  });

  const asAdmin = <T>(fn: () => Promise<T>) => runAsBackgroundTenant(admin, fn);

  it("drafts an invoice from a deal: the base value as its own line, each service, and the buyer's billing profile", async () => {
    const created = await asAdmin(() => di.getCreateInvoiceInteractor().invoke({ dealId }));
    if (!created.ok) throw new Error("create failed");

    expect(created.data).toMatchObject({
      status: "draft",
      number: null,
      currency: "eur",
      buyerName: "Acme GmbH",
      buyerAddress: "Hauptstr. 1\n10115 Berlin",
      buyerVatId: "DE123456789",
      netTotal: 52400,
      taxTotal: 9956,
      grossTotal: 62356,
    });
    expect(
      created.data.lines.map(({ description, quantity, unitPrice, taxRate }) => ({
        description,
        quantity,
        unitPrice,
        taxRate,
      })),
    ).toEqual([
      { description: "Market study", quantity: 1, unitPrice: 50000, taxRate: 19 },
      { description: "Workshop day", quantity: 2, unitPrice: 1200, taxRate: 19 },
    ]);
  });

  it("refuses to issue without seller details, then numbers issued invoices in sequence and snapshots the seller", async () => {
    const first = await asAdmin(() => di.getCreateInvoiceInteractor().invoke({ dealId }));
    const second = await asAdmin(() => di.getCreateInvoiceInteractor().invoke({ dealId }));
    if (!first.ok || !second.ok) throw new Error("create failed");

    const missing = (await asAdmin(() => di.getIssueInvoiceInteractor().invoke({ id: first.data.id }))) as Outcome;
    expect(codes(missing)).toEqual([CustomErrorCode.invoiceSellerMissing]);

    await asAdmin(() =>
      di.getUpdateInvoiceSettingsInteractor().invoke({
        sellerName: "Studio Nord GmbH",
        sellerAddress: "Nordweg 2\n20095 Hamburg",
        numberPrefix: "RE-",
        paymentTermsDays: 30,
      }),
    );

    const issueDate = new Date("2026-09-01T00:00:00.000Z");
    const one = await asAdmin(() => di.getIssueInvoiceInteractor().invoke({ id: first.data.id, issueDate }));
    const two = await asAdmin(() => di.getIssueInvoiceInteractor().invoke({ id: second.data.id, issueDate }));
    if (!one.ok || !two.ok) throw new Error("issue failed");

    expect([one.data.number, two.data.number]).toEqual(["RE-0001", "RE-0002"]);
    expect(one.data.dueDate?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(one.data.seller).toMatchObject({ name: "Studio Nord GmbH" });

    const editIssued = (await asAdmin(() =>
      di.getUpdateInvoiceInteractor().invoke({ id: one.data.id, notes: "late change" }),
    )) as Outcome;
    const deleteIssued = (await asAdmin(() => di.getDeleteInvoiceInteractor().invoke({ id: one.data.id }))) as Outcome;
    expect(codes(editIssued)).toEqual([CustomErrorCode.invoiceNotDraft]);
    expect(codes(deleteIssued)).toEqual([CustomErrorCode.invoiceNotDraft]);
  });

  it("records partial payments, refuses an overpayment, and marks the invoice paid at the balance", async () => {
    const created = await asAdmin(() =>
      di.getCreateInvoiceInteractor().invoke({
        lines: [{ description: "Advice", quantity: 1, unitPrice: 100, discountPercent: 0, taxRate: 19 }],
        buyerName: "Walk-in",
      }),
    );
    if (!created.ok) throw new Error("create failed");
    await asAdmin(() => di.getIssueInvoiceInteractor().invoke({ id: created.data.id }));

    const partial = await asAdmin(() =>
      di.getRecordInvoicePaymentInteractor().invoke({ id: created.data.id, amount: 100 }),
    );
    expect(partial).toMatchObject({ ok: true, data: { status: "issued", paidAmount: 100, balance: 19 } });

    const over = (await asAdmin(() =>
      di.getRecordInvoicePaymentInteractor().invoke({ id: created.data.id, amount: 19.01 }),
    )) as Outcome;
    expect(codes(over)).toEqual([CustomErrorCode.invoicePaymentExceedsBalance]);

    const rest = await asAdmin(() =>
      di.getRecordInvoicePaymentInteractor().invoke({ id: created.data.id, amount: 19 }),
    );
    expect(rest).toMatchObject({ ok: true, data: { status: "paid", balance: 0 } });

    const voidPaid = (await asAdmin(() => di.getVoidInvoiceInteractor().invoke({ id: created.data.id }))) as Outcome;
    expect(codes(voidPaid)).toEqual([CustomErrorCode.invoiceNotIssued]);
  });

  it("renders a PDF for drafts and issued invoices, and an XRechnung once the e-invoice details are complete", async () => {
    const draft = await asAdmin(() => di.getCreateInvoiceInteractor().invoke({ dealId }));
    if (!draft.ok) throw new Error("create failed");

    const draftPdf = await asAdmin(() =>
      di.getGetInvoiceDocumentInteractor().invoke({ id: draft.data.id, format: "pdf", locale: "de" }),
    );
    if (!draftPdf.ok) throw new Error("pdf failed");
    expect(draftPdf.data.contentType).toBe("application/pdf");
    expect(new TextDecoder().decode(draftPdf.data.body.slice(0, 5))).toBe("%PDF-");
    expect(draftPdf.data.fileName).toMatch(/^draft-[0-9a-f]{8}\.pdf$/);

    const draftXml = (await asAdmin(() =>
      di.getGetInvoiceDocumentInteractor().invoke({ id: draft.data.id, format: "xrechnung" }),
    )) as Outcome;
    expect(codes(draftXml)).toEqual([CustomErrorCode.invoiceNotIssued]);

    await asAdmin(() =>
      di.getUpdateInvoiceSettingsInteractor().invoke({
        sellerName: "Studio Nord GmbH",
        sellerAddress: "Nordweg 2\n20095 Hamburg",
        sellerVatId: "DE999999999",
        sellerEmail: "billing@studio-nord.example",
      }),
    );
    const issued = await asAdmin(() => di.getIssueInvoiceInteractor().invoke({ id: draft.data.id }));
    if (!issued.ok) throw new Error("issue failed");

    const incomplete = (await asAdmin(() =>
      di.getGetInvoiceDocumentInteractor().invoke({ id: draft.data.id, format: "xrechnung" }),
    )) as Outcome;
    expect(codes(incomplete)).toEqual([CustomErrorCode.invoiceXRechnungIncomplete]);

    const second = await asAdmin(() => di.getCreateInvoiceInteractor().invoke({ dealId }));
    if (!second.ok) throw new Error("create failed");
    await asAdmin(() => di.getUpdateInvoiceSettingsInteractor().invoke({ sellerPhone: "+49 40 123456" }));
    await asAdmin(() => di.getUpdateInvoiceInteractor().invoke({ id: second.data.id, buyerEmail: "ap@acme.example" }));
    const secondIssued = await asAdmin(() => di.getIssueInvoiceInteractor().invoke({ id: second.data.id }));
    if (!secondIssued.ok) throw new Error("issue failed");

    const xml = await asAdmin(() =>
      di.getGetInvoiceDocumentInteractor().invoke({ id: second.data.id, format: "xrechnung", locale: "de" }),
    );
    if (!xml.ok) throw new Error("xrechnung failed");
    const text = new TextDecoder().decode(xml.data.body);
    expect(xml.data.fileName).toBe(`${secondIssued.data.number}-xrechnung.xml`);
    expect(text).toContain(`<cbc:ID>${secondIssued.data.number}</cbc:ID>`);
    expect(text).toContain("<cbc:Telephone>+49 40 123456</cbc:Telephone>");
    expect(text).toContain('<cbc:PayableAmount currencyID="EUR">62356.00</cbc:PayableAmount>');
  });

  it("keeps invoices away from a role without invoice permissions", async () => {
    await expect(runAsBackgroundTenant(viewer, () => di.getGetInvoicesInteractor().invoke({}))).rejects.toThrow();
    await expect(
      runAsBackgroundTenant(viewer, () => di.getCreateInvoiceInteractor().invoke({ dealId })),
    ).rejects.toThrow();
  });
});
