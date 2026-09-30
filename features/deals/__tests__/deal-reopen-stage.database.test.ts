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
const { DealStatus, StageKind } = await import("@/generated/prisma");
const di = await import("@/core/di");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("reopening a deal on PostgreSQL", () => {
  const companyId = randomUUID();
  const pipelineId = randomUUID();
  const stages = { qualified: randomUUID(), proposal: randomUUID(), won: randomUUID() };
  let admin: string;

  beforeAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: companyId } });
      const role = await prisma.userRole.create({
        data: { companyId, name: `Admin ${randomUUID()}`, isSystemRole: true },
        select: { id: true },
      });
      admin = (
        await prisma.user.create({
          data: {
            companyId,
            roleId: role.id,
            email: `admin-${randomUUID()}@example.invalid`,
            firstName: "Admin",
            lastName: "Tester",
            status: "active",
          },
          select: { id: true },
        })
      ).id;
      await prisma.pipeline.create({ data: { id: pipelineId, companyId, name: "Sales", isDefault: true } });
      await prisma.pipelineStage.createMany({
        data: [
          { id: stages.qualified, companyId, pipelineId, name: "Qualified", position: 0 },
          { id: stages.proposal, companyId, pipelineId, name: "Proposal", position: 1 },
          { id: stages.won, companyId, pipelineId, name: "Won", position: 2, kind: StageKind.won },
        ],
      });
    });
  });

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: companyId } }));
    await prisma.$disconnect();
  });

  async function closedDeal(stageId: string, history: [string | null, string][]) {
    return runWithoutTenant(async () => {
      const deal = await prisma.deal.create({
        data: {
          companyId,
          name: `Deal ${randomUUID()}`,
          pipelineId,
          stageId,
          status: DealStatus.won,
          wonAt: new Date(),
          closedAt: new Date(),
        },
        select: { id: true },
      });
      for (const [index, [fromStageId, toStageId]] of history.entries()) {
        await prisma.dealStageHistory.create({
          data: {
            companyId,
            dealId: deal.id,
            fromStageId,
            toStageId,
            enteredAt: new Date(Date.UTC(2026, 0, index + 1)),
          },
        });
      }
      return deal.id;
    });
  }

  const reopen = (id: string) => runAsBackgroundTenant(admin, () => di.getReopenDealInteractor().invoke({ id }));

  it("puts a deal back in the open stage it left when it was closed", async () => {
    const id = await closedDeal(stages.won, [
      [null, stages.qualified],
      [stages.qualified, stages.proposal],
      [stages.proposal, stages.won],
    ]);

    expect(await reopen(id)).toMatchObject({ ok: true, data: { status: DealStatus.open, stageId: stages.proposal } });
  });

  it("keeps a deal in its stage when it was closed without leaving an open stage", async () => {
    const id = await closedDeal(stages.proposal, [[null, stages.proposal]]);

    expect(await reopen(id)).toMatchObject({ ok: true, data: { status: DealStatus.open, stageId: stages.proposal } });
  });

  it("falls back to the first stage when the history does not say where the deal came from", async () => {
    const id = await closedDeal(stages.won, []);

    expect(await reopen(id)).toMatchObject({ ok: true, data: { status: DealStatus.open, stageId: stages.qualified } });
  });
});
