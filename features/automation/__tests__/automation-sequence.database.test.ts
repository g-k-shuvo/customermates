import { createTranslator } from "next-intl";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
    EMAIL_TRANSPORT: "console",
  },
}));

const duringWait: Array<() => Promise<unknown>> = [];

vi.mock("workflow", () => ({
  sleep: async () => {
    for (const action of duringWait.splice(0)) await action();
  },
  getWorkflowMetadata: () => ({ workflowRunId: "wrun_sequence_test" }),
}));

const { randomUUID } = await import("node:crypto");
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runAsBackgroundTenant } = await import("@/core/decorators/background-tenant");
const { AutomationActionKind, AutomationRunStatus, AutomationTriggerKind, EntityType } = await import(
  "@/generated/prisma"
);
const { BackgroundTaskService } = await import("@/core/utils/background-task.service");
const { runAutomation } = await import("@/workflows/run-automation");
const { CONDITIONS_NO_LONGER_MET } = await import("@/features/automation/run/prepare-automation-run.interactor");
const di = await import("@/core/di");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("a sequence that waits", { timeout: 60_000 }, () => {
  const companyId = randomUUID();
  let ownerId: string;
  let qualifiedId: string;
  let proposalId: string;
  let automationId: string;
  const dispatched: Array<{ id: string; payload: { automationRunId: string; companyId: string } }> = [];

  beforeAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: companyId } });
      const role = await prisma.userRole.create({
        data: { companyId, name: `Admin ${randomUUID()}`, isSystemRole: true },
        select: { id: true },
      });
      ownerId = (
        await prisma.user.create({
          data: {
            companyId,
            roleId: role.id,
            email: `owner-${randomUUID()}@example.invalid`,
            firstName: "Owner",
            lastName: "Tester",
            status: "active",
          },
          select: { id: true },
        })
      ).id;
      const pipeline = await prisma.pipeline.create({
        data: { companyId, name: "Sales", position: 0 },
        select: { id: true },
      });
      qualifiedId = (
        await prisma.pipelineStage.create({
          data: { companyId, pipelineId: pipeline.id, name: "Qualified", position: 0, kind: "open" },
          select: { id: true },
        })
      ).id;
      proposalId = (
        await prisma.pipelineStage.create({
          data: { companyId, pipelineId: pipeline.id, name: "Proposal", position: 1, kind: "open" },
          select: { id: true },
        })
      ).id;
      automationId = (
        await prisma.automation.create({
          data: {
            companyId,
            name: "Proposal follow-up",
            enabled: true,
            entityType: EntityType.deal,
            triggerKind: AutomationTriggerKind.recordUpdated,
            changedFields: [],
            conditions: [{ field: "stageId", operator: "in", value: [proposalId] }],
            steps: {
              create: [
                { companyId, position: 0, kind: AutomationActionKind.delay, config: { seconds: 3 * 24 * 3600 } },
                {
                  companyId,
                  position: 1,
                  kind: AutomationActionKind.createNote,
                  config: { body: "Chase the proposal" },
                },
              ],
            },
          },
          select: { id: true },
        })
      ).id;
    });
  });

  beforeEach(() => {
    dispatched.length = 0;
    vi.spyOn(BackgroundTaskService.prototype, "dispatch").mockImplementation((id: string, payload: unknown) => {
      dispatched.push({ id, payload: payload as { automationRunId: string; companyId: string } });
      return Promise.resolve();
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: companyId } }));
    await prisma.$disconnect();
  });

  const newDeal = (name: string) =>
    runWithoutTenant(() =>
      prisma.deal.create({ data: { companyId, name, stageId: qualifiedId }, select: { id: true } }),
    );
  const update = (dealId: string, data: Record<string, unknown>) =>
    runAsBackgroundTenant(ownerId, () => di.getUpdateDealInteractor().invoke({ id: dealId, ...data } as never));
  const runsFor = (dealId: string) =>
    runWithoutTenant(() =>
      prisma.automationRun.findMany({
        where: { automationId, entityId: dealId },
        orderBy: { createdAt: "asc" },
        select: { id: true, status: true, error: true, dedupeKey: true },
      }),
    );
  const notesOf = (dealId: string) =>
    runWithoutTenant(() => prisma.deal.findUnique({ where: { id: dealId }, select: { notes: true } }));
  const runDispatched = async () => {
    for (const entry of dispatched.splice(0).filter((candidate) => candidate.id === "run-automation"))
      await runAutomation(entry.payload);
  };

  it("keeps one sequence per record while it waits, and finishes it when the record still qualifies", async () => {
    const deal = await newDeal("Keeps qualifying");

    await update(deal.id, { stageId: proposalId });
    await update(deal.id, { name: "Keeps qualifying (renamed)" });

    const admitted = await runsFor(deal.id);
    expect(admitted).toHaveLength(1);
    expect(admitted[0].dedupeKey).toBe(`sequence:deal:${deal.id}`);

    await runDispatched();

    const [run] = await runsFor(deal.id);
    expect(run).toMatchObject({ status: AutomationRunStatus.succeeded, dedupeKey: null });
    expect(JSON.stringify((await notesOf(deal.id))?.notes)).toContain("Chase the proposal");
  });

  it("cancels the sequence when the record leaves the stage during the wait, and admits a new one later", async () => {
    const deal = await newDeal("Moves on");
    await update(deal.id, { stageId: proposalId });
    duringWait.push(() =>
      runWithoutTenant(() => prisma.deal.update({ where: { id: deal.id }, data: { stageId: qualifiedId } })),
    );

    await runDispatched();

    const [cancelled] = await runsFor(deal.id);
    expect(cancelled).toMatchObject({
      status: AutomationRunStatus.cancelled,
      error: CONDITIONS_NO_LONGER_MET,
      dedupeKey: null,
    });
    expect(JSON.stringify((await notesOf(deal.id))?.notes ?? "")).not.toContain("Chase the proposal");
    const steps = await runWithoutTenant(() =>
      prisma.automationRunStep.findMany({
        where: { runId: cancelled.id },
        orderBy: { position: "asc" },
        select: { status: true },
      }),
    );
    expect(steps.map((step) => step.status)).toEqual([AutomationRunStatus.succeeded, AutomationRunStatus.cancelled]);

    await update(deal.id, { stageId: proposalId });
    expect((await runsFor(deal.id)).map((run) => run.status)).toEqual([
      AutomationRunStatus.cancelled,
      AutomationRunStatus.queued,
    ]);
  });

  it("cancels the sequence when the record is deleted during the wait", async () => {
    const deal = await newDeal("Goes away");
    await update(deal.id, { stageId: proposalId });
    const [queued] = await runsFor(deal.id);
    duringWait.push(() => runWithoutTenant(() => prisma.deal.delete({ where: { id: deal.id } })));

    await runDispatched();

    const run = await runWithoutTenant(() =>
      prisma.automationRun.findUnique({ where: { id: queued.id }, select: { status: true } }),
    );
    expect(run?.status).toBe(AutomationRunStatus.cancelled);
  });
});
