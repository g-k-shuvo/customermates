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

const { PrismaAutomationRepo } = await import("@/features/automation/prisma-automation.repository");
const { PrepareAutomationRunInteractor } = await import("@/features/automation/run/prepare-automation-run.interactor");
const { ExecuteAutomationStepInteractor } = await import(
  "@/features/automation/run/execute-automation-step.interactor"
);
const { currentAutomationContext } = await import("@/core/decorators/automation-context");
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { AutomationActionKind, AutomationTriggerKind, EntityType } = await import("@/generated/prisma");
const { DomainEvent } = await import("@/features/event/domain-events");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companyIds: string[] = [];

async function setup() {
  return runWithoutTenant(async () => {
    const company = await prisma.company.create({ data: {} });
    companyIds.push(company.id);
    const ids: string[] = [];
    for (const name of ["First", "Second"]) {
      const automation = await prisma.automation.create({
        data: {
          companyId: company.id,
          name,
          enabled: true,
          entityType: EntityType.deal,
          triggerKind: AutomationTriggerKind.recordUpdated,
        },
        select: { id: true },
      });
      await prisma.automationStep.create({
        data: {
          companyId: company.id,
          automationId: automation.id,
          position: 0,
          kind: AutomationActionKind.createNote,
          config: { body: "touched" },
        },
      });
      ids.push(automation.id);
    }

    return { companyId: company.id, first: ids[0], second: ids[1] };
  });
}

const DEAL_ID = "00000000-0000-4000-8000-00000000d0d0";

describeDatabase("chained automation runs", () => {
  afterAll(async () => {
    await runWithoutTenant(async () => {
      for (const companyId of companyIds) await prisma.company.delete({ where: { id: companyId } });
    });
    await prisma.$disconnect();
  });

  it("stores a chained run's depth and chain, and admits it once per parent run and record", async () => {
    const { companyId, first, second } = await setup();
    const repo = new PrismaAutomationRepo();
    const causation = { depth: 1, chain: [first], parentRunId: "00000000-0000-4000-8000-0000000000aa" };
    const admit = () =>
      runWithoutTenant(() =>
        repo.admitAutomationRunsUnscoped({
          companyId,
          automationIds: [second],
          entityType: EntityType.deal,
          entityId: DEAL_ID,
          triggerEvent: DomainEvent.DEAL_UPDATED,
          triggerPayload: {},
          causation,
        }),
      );

    const [admitted] = await admit();
    const again = await admit();
    const plain = await runWithoutTenant(() =>
      repo.admitAutomationRunsUnscoped({
        companyId,
        automationIds: [first],
        entityType: EntityType.deal,
        entityId: DEAL_ID,
        triggerEvent: DomainEvent.DEAL_UPDATED,
        triggerPayload: {},
      }),
    );

    expect(again).toEqual([]);
    expect(plain).toHaveLength(1);
    const plan = await runWithoutTenant(() => repo.findRunPlanUnscoped(admitted.id));
    expect(plan).toMatchObject({ causationDepth: 1, causationChain: [first], automationName: "Second" });
  });

  it("runs a step one level deeper with its own automation added to the chain", async () => {
    const { companyId, first, second } = await setup();
    const repo = new PrismaAutomationRepo();
    const [admitted] = await runWithoutTenant(() =>
      repo.admitAutomationRunsUnscoped({
        companyId,
        automationIds: [second],
        entityType: EntityType.deal,
        entityId: DEAL_ID,
        triggerEvent: DomainEvent.DEAL_UPDATED,
        triggerPayload: {},
        causation: { depth: 1, chain: [first], parentRunId: "00000000-0000-4000-8000-0000000000ab" },
      }),
    );
    const plan = await runWithoutTenant(() => repo.findRunPlanUnscoped(admitted.id));
    if (!plan) throw new Error("no plan");

    let seen: unknown = null;
    const executor = {
      execute: () => {
        seen = currentAutomationContext();
        return Promise.resolve({ ok: true as const, output: {} });
      },
    };
    await new ExecuteAutomationStepInteractor(repo, executor as never).perform({
      claimed: true,
      automationId: plan.automationId,
      runId: plan.runId,
      runStepId: plan.steps[0].id,
      kind: plan.steps[0].kind,
      config: plan.steps[0].config,
      context: { run: plan, runStepId: plan.steps[0].id, entityType: plan.entityType, entityId: plan.entityId },
    } as never);

    expect(seen).toEqual({ automationId: second, runId: admitted.id, causationDepth: 2, causationChain: [first] });
  });

  it("records a settled run on the record's activity as its owner, and nothing for a deleted record", async () => {
    const { companyId, first } = await setup();
    const repo = new PrismaAutomationRepo();
    const admitFor = (triggerEvent: string) =>
      runWithoutTenant(() =>
        repo.admitAutomationRunsUnscoped({
          companyId,
          automationIds: [first],
          entityType: EntityType.deal,
          entityId: DEAL_ID,
          triggerEvent,
          triggerPayload: {},
        }),
      );
    const publish = vi.fn().mockResolvedValue({});
    const prepare = new PrepareAutomationRunInteractor(repo, {} as never, { publish } as never);

    const [updated] = await admitFor(DomainEvent.DEAL_UPDATED);
    await runWithoutTenant(() =>
      prepare.settle({ automationRunId: updated.id, companyId, failed: false, ownerUserId: "owner-1" }),
    );
    await runWithoutTenant(async () => {
      await prisma.automationRun.deleteMany({ where: { companyId, id: updated.id } });
    });
    const [deleted] = await admitFor(DomainEvent.DEAL_DELETED);
    await runWithoutTenant(() =>
      prepare.settle({ automationRunId: deleted.id, companyId, failed: false, ownerUserId: "owner-1" }),
    );

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(
      DomainEvent.DEAL_AUTOMATED,
      { entityId: DEAL_ID, payload: { name: "First" } },
      { systemCompanyId: companyId, systemUserId: "owner-1" },
    );
  });
});
