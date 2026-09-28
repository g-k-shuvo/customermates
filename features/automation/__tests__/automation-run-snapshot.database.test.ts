import { afterAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "self-hosted",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
    BASE_URL: "http://localhost:4000",
    BETTER_AUTH_SECRET: "vitest-secret",
    RESEND_OPERATOR_EMAIL: "operator@example.invalid",
    EMAIL_TRANSPORT: "console",
  },
}));

const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { AutomationActionKind, AutomationTriggerKind, EntityType } = await import("@/generated/prisma");
const { PrismaAutomationRepo } = await import("@/features/automation/prisma-automation.repository");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companyIds: string[] = [];

async function makeAutomation() {
  return runWithoutTenant(async () => {
    const company = await prisma.company.create({ data: {} });
    companyIds.push(company.id);

    const automation = await prisma.automation.create({
      data: {
        companyId: company.id,
        name: "Follow up",
        enabled: true,
        entityType: EntityType.deal,
        triggerKind: AutomationTriggerKind.recordCreated,
      },
      select: { id: true },
    });

    await prisma.automationStep.createMany({
      data: [
        {
          companyId: company.id,
          automationId: automation.id,
          position: 0,
          kind: AutomationActionKind.delay,
          config: { seconds: 86400 },
        },
        {
          companyId: company.id,
          automationId: automation.id,
          position: 1,
          kind: AutomationActionKind.createNote,
          config: { body: "Day one" },
        },
      ],
    });

    return { companyId: company.id, automationId: automation.id };
  });
}

async function admit(companyId: string, automationId: string) {
  const [run] = await new PrismaAutomationRepo().admitAutomationRunsUnscoped({
    companyId,
    automationIds: [automationId],
    entityType: EntityType.deal,
    entityId: "00000000-0000-4000-8000-000000000001",
    triggerEvent: "deal.created",
    triggerPayload: {},
  });
  if (!run) throw new Error("no run admitted");

  return run.id;
}

describeDatabase("an admitted automation run keeps the steps it was admitted with", () => {
  afterAll(async () => {
    await runWithoutTenant(async () => {
      for (const companyId of companyIds) await prisma.company.delete({ where: { id: companyId } });
    });
    await prisma.$disconnect();
  });

  it("runs the admitted config after the automation's steps are edited", async () => {
    const { companyId, automationId } = await makeAutomation();
    const runId = await admit(companyId, automationId);

    await runWithoutTenant(async () => {
      await prisma.automationStep.deleteMany({ where: { automationId } });
      await prisma.automationStep.create({
        data: {
          companyId,
          automationId,
          position: 0,
          kind: AutomationActionKind.createNote,
          config: { body: "Edited" },
        },
      });
    });

    const plan = await new PrismaAutomationRepo().findRunPlanUnscoped(runId);

    expect(plan?.steps.map(({ kind, config }) => ({ kind, config }))).toEqual([
      { kind: AutomationActionKind.delay, config: { seconds: 86400 } },
      { kind: AutomationActionKind.createNote, config: { body: "Day one" } },
    ]);
  });

  it("keeps the steps of a queued run whose automation lost every step", async () => {
    const { companyId, automationId } = await makeAutomation();
    const runId = await admit(companyId, automationId);

    await runWithoutTenant(() => prisma.automationStep.deleteMany({ where: { automationId } }));

    const plan = await new PrismaAutomationRepo().findRunPlanUnscoped(runId);
    const runs = await runWithoutTenant(() =>
      prisma.automationRunStep.findMany({ where: { runId }, select: { stepId: true } }),
    );

    expect(runs.map(({ stepId }) => stepId)).toEqual([null, null]);
    expect(plan?.steps).toHaveLength(2);
  });

  it("falls back to the live step for a run step admitted before snapshots existed", async () => {
    const { companyId, automationId } = await makeAutomation();
    const runId = await admit(companyId, automationId);

    await runWithoutTenant(
      () => prisma.$executeRaw`UPDATE "AutomationRunStep" SET "snapshot" = NULL WHERE "runId" = ${runId}`,
    );

    const plan = await new PrismaAutomationRepo().findRunPlanUnscoped(runId);

    expect(plan?.steps.map(({ kind }) => kind)).toEqual([AutomationActionKind.delay, AutomationActionKind.createNote]);
  });
});
