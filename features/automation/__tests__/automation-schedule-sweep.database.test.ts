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
    EMAIL_TRANSPORT: "smtp",
  },
}));

const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { AutomationActionKind, AutomationRunStatus, AutomationTriggerKind } = await import("@/generated/prisma");
const { PrismaAutomationRepo } = await import("@/features/automation/prisma-automation.repository");
const { SweepDueAutomationsInteractor } = await import("@/features/automation/run/sweep-due-automations.interactor");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companyIds: string[] = [];

async function makeScheduled(args: { nextRunAt: Date | null; steps?: number }) {
  return runWithoutTenant(async () => {
    const company = await prisma.company.create({ data: {} });
    companyIds.push(company.id);

    const automation = await prisma.automation.create({
      data: {
        companyId: company.id,
        name: "Weekly digest",
        enabled: true,
        triggerKind: AutomationTriggerKind.schedule,
        schedule: "0 9 * * 1",
        scheduleTimeZone: "Europe/Berlin",
        nextRunAt: args.nextRunAt,
      },
      select: { id: true },
    });

    for (let position = 0; position < (args.steps ?? 1); position += 1) {
      await prisma.automationStep.create({
        data: {
          companyId: company.id,
          automationId: automation.id,
          position,
          kind: position === 0 ? AutomationActionKind.delay : AutomationActionKind.createNote,
          config: position === 0 ? { seconds: 120 } : { body: "after the wait" },
        },
      });
    }

    return { companyId: company.id, automationId: automation.id };
  });
}

describeDatabase("the sweep that fires a scheduled automation", () => {
  afterAll(async () => {
    await runWithoutTenant(async () => {
      for (const companyId of companyIds) await prisma.company.delete({ where: { id: companyId } });
    });
    await prisma.$disconnect();
  });

  it("finds an automation whose next run has passed", async () => {
    const { companyId, automationId } = await makeScheduled({ nextRunAt: new Date(Date.now() - 60_000) });

    const due = await new PrismaAutomationRepo().findDueAutomationsUnscoped(new Date(), 10);

    expect(due.filter((entry) => entry.companyId === companyId).map(({ id }) => id)).toEqual([automationId]);
  });

  it("leaves an automation whose next run is still ahead", async () => {
    const { companyId } = await makeScheduled({ nextRunAt: new Date(Date.now() + 60 * 60_000) });

    const due = await new PrismaAutomationRepo().findDueAutomationsUnscoped(new Date(), 10);

    expect(due.filter((entry) => entry.companyId === companyId)).toEqual([]);
  });

  it("claims a due automation exactly once and advances its next run", async () => {
    const { companyId, automationId } = await makeScheduled({ nextRunAt: new Date(Date.now() - 60_000) });
    const repo = new PrismaAutomationRepo();
    const nextRunAt = new Date(Date.now() + 7 * 24 * 60 * 60_000);

    const first = await repo.claimScheduledAutomationUnscoped({ automationId, companyId, nextRunAt });
    const second = await repo.claimScheduledAutomationUnscoped({ automationId, companyId, nextRunAt });

    expect(first).not.toBeNull();
    expect(second).toBeNull();

    const after = await runWithoutTenant(() => prisma.automation.findUnique({ where: { id: automationId } }));
    expect(after?.nextRunAt?.toISOString()).toBe(nextRunAt.toISOString());
  });

  it("dispatches a run for each due automation through the sweep", async () => {
    const { companyId } = await makeScheduled({ nextRunAt: new Date(Date.now() - 60_000) });
    const dispatched: Array<{ id: string; payload: unknown }> = [];

    const sweep = new SweepDueAutomationsInteractor(new PrismaAutomationRepo(), {
      dispatch: (id: string, payload: unknown) => {
        dispatched.push({ id, payload });

        return Promise.resolve();
      },
    } as never);

    const outcome = await sweep.invoke();

    expect(outcome.ok).toBe(true);
    expect(dispatched.some((entry) => entry.id === "run-automation")).toBe(true);

    const runs = await runWithoutTenant(() => prisma.automationRun.findMany({ where: { companyId } }));
    expect(runs).toHaveLength(1);
    expect(runs[0]?.triggerEvent).toBe("schedule");
    expect(runs[0]?.status).toBe(AutomationRunStatus.queued);
  });

  it("reads a delay step as a wait the workflow performs rather than an action", async () => {
    const { companyId, automationId } = await makeScheduled({
      nextRunAt: new Date(Date.now() - 60_000),
      steps: 2,
    });
    const repo = new PrismaAutomationRepo();

    const runId = await repo.claimScheduledAutomationUnscoped({
      automationId,
      companyId,
      nextRunAt: new Date(Date.now() + 60_000),
    });
    expect(runId).not.toBeNull();

    const plan = await repo.findRunPlanUnscoped(runId as string);

    expect(plan?.steps.map(({ kind }) => kind)).toEqual([AutomationActionKind.delay, AutomationActionKind.createNote]);
    expect(plan?.steps[0]?.config).toEqual({ seconds: 120 });
  });
});
