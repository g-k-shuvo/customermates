import { afterAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

vi.mock("@/env", () => ({
  env: { APP_MODE: "cloud", DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: "test" },
}));
vi.mock("@/core/di", () => ({
  getDealRepo: () => new PrismaDealRepo(new PrismaCompanyRepo()),
  getCustomColumnRepo: () => new PrismaCustomColumnRepo(new PrismaCompanyRepo()),
}));

const { PrismaCompanyRepo } = await import("@/features/company/prisma-company.repository");
const { PrismaDealRepo } = await import("@/features/deals/prisma-deal.repository");
const { PrismaCustomColumnRepo } = await import("@/features/custom-column/prisma-custom-column.repository");
const { prisma } = await import("@/prisma/db");
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runInTransaction } = await import("@/core/decorators/transaction-runner");
const { getTransactionClient } = await import("@/core/decorators/transaction-context");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companyIds: string[] = [];

async function makeWorkspace() {
  return runWithoutTenant(async () => {
    const company = await prisma.company.create({ data: {} });
    companyIds.push(company.id);
    const pipeline = await prisma.pipeline.create({ data: { companyId: company.id, name: "Sales", isDefault: true } });
    const stage = await prisma.pipelineStage.create({
      data: { companyId: company.id, pipelineId: pipeline.id, name: "Qualified", probability: 25 },
    });
    const deal = await prisma.deal.create({
      data: { companyId: company.id, name: "Weighted deal", pipelineId: pipeline.id, stageId: stage.id },
    });
    const service = await prisma.service.create({ data: { companyId: company.id, name: "Service", amount: 100 } });
    await prisma.serviceDeal.create({
      data: { companyId: company.id, serviceId: service.id, dealId: deal.id, quantity: 2 },
    });

    return { company, stage, deal, user: createMockUser({ id: crypto.randomUUID(), companyId: company.id }) };
  });
}

function readDeal(id: string) {
  return runWithoutTenant(() =>
    prisma.deal.findUniqueOrThrow({
      where: { id },
      select: { totalValue: true, totalQuantity: true, weightedValue: true },
    }),
  );
}

function setStageProbability(stage: { id: string; companyId: string }, probability: number) {
  const client = getTransactionClient<typeof prisma>() ?? prisma;

  return client.pipelineStage.update({ where: { id: stage.id, companyId: stage.companyId }, data: { probability } });
}

describeDatabase("deal weighting from pipeline stage probability", () => {
  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companyIds } } }));
    await prisma.$disconnect();
  });

  it("weights the active tenant's deal by its stage without recalculating another tenant's deal", async () => {
    const first = await makeWorkspace();
    const second = await makeWorkspace();
    const repo = new PrismaDealRepo(new PrismaCompanyRepo());

    await runWithTenant(first.user, () =>
      runInTransaction(() => repo.recalculateTotals([first.deal.id, second.deal.id])),
    );

    expect(await readDeal(first.deal.id)).toEqual({ totalValue: 200, totalQuantity: 2, weightedValue: 50 });
    expect(await readDeal(second.deal.id)).toEqual({ totalValue: 0, totalQuantity: 0, weightedValue: null });
  });

  it("lets the deal's own probability override its stage's", async () => {
    const fixture = await makeWorkspace();
    await runWithoutTenant(() => prisma.deal.update({ where: { id: fixture.deal.id }, data: { probability: 60 } }));

    await runWithTenant(fixture.user, () =>
      runInTransaction(() => new PrismaDealRepo(new PrismaCompanyRepo()).recalculateTotals([fixture.deal.id])),
    );

    expect(await readDeal(fixture.deal.id)).toEqual({ totalValue: 200, totalQuantity: 2, weightedValue: 120 });
  });

  it("recalculates with a stage probability written in the same transaction", async () => {
    const fixture = await makeWorkspace();
    const repo = new PrismaDealRepo(new PrismaCompanyRepo());

    await runWithTenant(fixture.user, () =>
      runInTransaction(async () => {
        await setStageProbability(fixture.stage, 40);
        await repo.recalculateWeightedValuesForCompany();
      }),
    );

    expect(await readDeal(fixture.deal.id)).toEqual({ totalValue: 200, totalQuantity: 2, weightedValue: 80 });
  });

  it("rolls back the stage probability and weighted totals when the outer transaction fails", async () => {
    const fixture = await makeWorkspace();
    const repo = new PrismaDealRepo(new PrismaCompanyRepo());
    await runWithTenant(fixture.user, () => runInTransaction(() => repo.recalculateTotals([fixture.deal.id])));

    await expect(
      runWithTenant(fixture.user, () =>
        runInTransaction(async () => {
          await setStageProbability(fixture.stage, 80);
          await repo.recalculateWeightedValuesForCompany();
          throw new Error("Forced rollback");
        }),
      ),
    ).rejects.toThrow("Forced rollback");

    expect((await readDeal(fixture.deal.id)).weightedValue).toBe(50);
    const stage = await runWithoutTenant(() =>
      prisma.pipelineStage.findUniqueOrThrow({ where: { id: fixture.stage.id }, select: { probability: true } }),
    );
    expect(stage.probability).toBe(25);
  });

  it("leaves a deal without a stage or probability unweighted", async () => {
    const fixture = await makeWorkspace();
    await runWithoutTenant(() =>
      prisma.deal.update({ where: { id: fixture.deal.id }, data: { stageId: null, pipelineId: null } }),
    );

    await runWithTenant(fixture.user, () =>
      runInTransaction(() => new PrismaDealRepo(new PrismaCompanyRepo()).recalculateTotals([fixture.deal.id])),
    );

    expect(await readDeal(fixture.deal.id)).toEqual({ totalValue: 200, totalQuantity: 2, weightedValue: null });
  });
});
