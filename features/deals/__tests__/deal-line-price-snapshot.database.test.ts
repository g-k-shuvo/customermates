import { afterAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    BASE_URL: "https://crm.example.test",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));
vi.mock("@/core/di", () => ({
  getDealRepo: () => new PrismaDealRepo(new PrismaCompanyRepo()),
  getCustomColumnRepo: () => new PrismaCustomColumnRepo(new PrismaCompanyRepo()),
  getPipelineRepo: () => ({}),
}));

const { PrismaCompanyRepo } = await import("@/features/company/prisma-company.repository");
const { PrismaDealRepo } = await import("@/features/deals/prisma-deal.repository");
const { PrismaServiceRepo } = await import("@/features/services/prisma-service.repository");
const { PrismaInvoiceRepo } = await import("@/features/invoices/prisma-invoice.repository");
const { PrismaCustomColumnRepo } = await import("@/features/custom-column/prisma-custom-column.repository");
const { prisma } = await import("@/prisma/db");
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runInTransaction } = await import("@/core/decorators/transaction-runner");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("deal lines keep the price they were added at", () => {
  let companyId = "";

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: companyId } }));
    await prisma.$disconnect();
  });

  it("ignores later catalogue price changes, keeps the price through edits, and prices new lines at today's price", async () => {
    const fixture = await runWithoutTenant(async () => {
      const company = await prisma.company.create({ data: {} });
      companyId = company.id;
      const [won, fresh] = await Promise.all([
        prisma.deal.create({ data: { companyId, name: "Won deal" } }),
        prisma.deal.create({ data: { companyId, name: "Fresh deal" } }),
      ]);
      const service = await prisma.service.create({ data: { companyId, name: "Training", amount: 100 } });
      await prisma.serviceDeal.create({
        data: { companyId, serviceId: service.id, dealId: won.id, quantity: 2, unitPrice: 100 },
      });

      return { won, fresh, service, user: createMockUser({ id: crypto.randomUUID(), companyId }) };
    });
    const deals = new PrismaDealRepo(new PrismaCompanyRepo());
    const services = new PrismaServiceRepo();
    const as = <T>(fn: () => Promise<T>) => runWithTenant(fixture.user, () => runInTransaction(fn));
    const readTotal = (id: string) =>
      runWithoutTenant(() => prisma.deal.findUniqueOrThrow({ where: { id }, select: { totalValue: true } }));
    const readLine = (dealId: string) =>
      runWithoutTenant(() =>
        prisma.serviceDeal.findFirstOrThrow({ where: { dealId }, select: { unitPrice: true, quantity: true } }),
      );

    await as(() => services.updateServiceOrThrow({ id: fixture.service.id, amount: 150 } as never));
    await as(() => deals.recalculateTotals([fixture.won.id]));
    expect(await readTotal(fixture.won.id)).toEqual({ totalValue: 200 });

    await as(() =>
      deals.updateDealOrThrow({
        id: fixture.won.id,
        services: [{ serviceId: fixture.service.id, quantity: 3 }],
      } as never),
    );
    await as(() => deals.recalculateTotals([fixture.won.id]));
    expect(await readLine(fixture.won.id)).toEqual({ unitPrice: 100, quantity: 3 });
    expect(await readTotal(fixture.won.id)).toEqual({ totalValue: 300 });

    await as(() =>
      deals.updateDealOrThrow({
        id: fixture.fresh.id,
        services: [{ serviceId: fixture.service.id, quantity: 1 }],
      } as never),
    );
    await as(() => deals.recalculateTotals([fixture.fresh.id]));
    expect(await readLine(fixture.fresh.id)).toEqual({ unitPrice: 150, quantity: 1 });
    expect(await readTotal(fixture.fresh.id)).toEqual({ totalValue: 150 });

    const shown = await as(() => deals.getOrThrowCompanyWide(fixture.won.id));
    expect(shown.services).toEqual([expect.objectContaining({ id: fixture.service.id, amount: 100, quantity: 3 })]);

    const forInvoice = await as(() => new PrismaInvoiceRepo().findDealForInvoiceOrNull(fixture.won.id));
    expect(forInvoice?.services).toEqual([
      expect.objectContaining({ serviceId: fixture.service.id, amount: 100, quantity: 3 }),
    ]);
  });
});
