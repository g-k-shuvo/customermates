import { createTranslator } from "next-intl";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("workflow", () => ({ sleep: () => Promise.resolve() }));

const { randomUUID } = await import("node:crypto");
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runAsBackgroundTenant } = await import("@/core/decorators/background-tenant");
const { AutomationActionKind, AutomationRunStatus, AutomationTriggerKind, EntityType } = await import(
  "@/generated/prisma"
);
const { BackgroundTaskService } = await import("@/core/utils/background-task.service");
const { runAutomation } = await import("@/workflows/run-automation");
const di = await import("@/core/di");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("a stage-transition automation", { timeout: 60_000 }, () => {
  const companyId = randomUUID();
  let ownerId: string;
  let dealId: string;
  let qualifiedId: string;
  let proposalId: string;
  let automationId: string;
  const dispatched: Array<{ id: string; payload: { automationRunId: string; companyId: string } }> = [];

  beforeEach(async () => {
    dispatched.length = 0;
    vi.spyOn(BackgroundTaskService.prototype, "dispatch").mockImplementation((id: string, payload: unknown) => {
      dispatched.push({ id, payload: payload as { automationRunId: string; companyId: string } });
      return Promise.resolve();
    });

    if (automationId) return;
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
      dealId = (
        await prisma.deal.create({
          data: { companyId, name: "Rollout", pipelineId: pipeline.id, stageId: qualifiedId },
          select: { id: true },
        })
      ).id;
      automationId = (
        await prisma.automation.create({
          data: {
            companyId,
            name: "Entered Proposal",
            enabled: true,
            entityType: EntityType.deal,
            triggerKind: AutomationTriggerKind.recordUpdated,
            changedFields: ["stageId"],
            conditions: [{ field: "stageId", operator: "in", value: [proposalId] }],
            steps: {
              create: [
                { companyId, position: 0, kind: AutomationActionKind.createNote, config: { body: "Entered Proposal" } },
              ],
            },
          },
          select: { id: true },
        })
      ).id;
    });
  });

  afterEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: companyId } }));
    await prisma.$disconnect();
  });

  const update = (data: Record<string, unknown>) =>
    runAsBackgroundTenant(ownerId, () => di.getUpdateDealInteractor().invoke({ id: dealId, ...data } as never));

  const runsSoFar = () =>
    runWithoutTenant(() =>
      prisma.automationRun.findMany({
        where: { automationId },
        select: { id: true, status: true },
        orderBy: { createdAt: "asc" },
      }),
    );

  async function runDispatched() {
    for (const entry of dispatched.filter((candidate) => candidate.id === "run-automation"))
      await runAutomation(entry.payload);
  }

  it("does not run when an update leaves the stage alone", async () => {
    const outcome = await update({ name: "Rollout (renamed)" });
    expect(outcome.ok).toBe(true);
    await runDispatched();

    expect(await runsSoFar()).toEqual([]);
  });

  it("runs exactly when the deal moves into the stage", async () => {
    await update({ stageId: proposalId });
    await runDispatched();

    const runs = await runsSoFar();
    expect(runs.map((run) => run.status)).toEqual([AutomationRunStatus.succeeded]);
  });

  it("is admitted but skipped when the stage changes to another one", async () => {
    await update({ stageId: qualifiedId });
    await runDispatched();

    const runs = await runsSoFar();
    expect(runs.map((run) => run.status)).toEqual([AutomationRunStatus.succeeded, AutomationRunStatus.skipped]);
  });
});
