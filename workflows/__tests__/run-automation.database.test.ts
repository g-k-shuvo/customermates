import type { Prisma } from "@/generated/prisma";

import { createTranslator } from "next-intl";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import messages from "@/i18n/locales/en.json";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { runStepLikeTheWorkflowRuntime } from "@/tests/helpers/workflow-step-runtime";

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
const { Action, AutomationActionKind, AutomationRunStatus, AutomationTriggerKind, EntityType, Resource } = await import(
  "@/generated/prisma"
);
const { PrismaAutomationRepo } = await import("@/features/automation/prisma-automation.repository");
const { BackgroundTaskService } = await import("@/core/utils/background-task.service");
const { ExecuteAutomationStepInteractor } = await import(
  "@/features/automation/run/execute-automation-step.interactor"
);
const { serializeJSONToMarkdown } = await import("@/components/editor/editor.utils");
const { executeStep, runAutomation } = await import("@/workflows/run-automation");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companyIds: string[] = [];

type Permission = readonly [(typeof Resource)[keyof typeof Resource], (typeof Action)[keyof typeof Action]];

const OWNER_PERMISSIONS: readonly Permission[] = [
  [Resource.automations, Action.readAll],
  [Resource.tasks, Action.create],
  [Resource.tasks, Action.readAll],
  [Resource.deals, Action.readAll],
  [Resource.deals, Action.update],
];

const WITHOUT_TASK_CREATE = OWNER_PERMISSIONS.filter(
  ([resource, action]) => !(resource === Resource.tasks && action === Action.create),
);

type Workspace = { companyId: string; ownerId: string; roleId: string; dealId: string; wonStageId: string };
type StepSeed = {
  kind: (typeof AutomationActionKind)[keyof typeof AutomationActionKind];
  config: Prisma.InputJsonValue;
};

async function makeWorkspace(dealName: string, permissions: readonly Permission[] = OWNER_PERMISSIONS) {
  return runWithoutTenant(async (): Promise<Workspace> => {
    const company = await prisma.company.create({ data: {} });
    companyIds.push(company.id);

    const role = await prisma.userRole.create({
      data: {
        companyId: company.id,
        name: "Automation owner",
        isSystemRole: false,
        permissions: {
          create: permissions.map(([resource, action]) => ({ companyId: company.id, resource, action })),
        },
      },
      select: { id: true },
    });
    const owner = await prisma.user.create({
      data: {
        companyId: company.id,
        roleId: role.id,
        email: `automation-owner-${company.id}@example.invalid`,
        firstName: "Automation",
        lastName: "Owner",
        status: "active",
      },
      select: { id: true },
    });
    const pipeline = await prisma.pipeline.create({
      data: { companyId: company.id, name: "Sales", position: 0 },
      select: { id: true },
    });
    const [openStage, wonStage] = await Promise.all([
      prisma.pipelineStage.create({
        data: { companyId: company.id, pipelineId: pipeline.id, name: "Qualified", position: 0, kind: "open" },
        select: { id: true },
      }),
      prisma.pipelineStage.create({
        data: { companyId: company.id, pipelineId: pipeline.id, name: "Proposal", position: 1, kind: "open" },
        select: { id: true },
      }),
    ]);
    const deal = await prisma.deal.create({
      data: { companyId: company.id, name: dealName, pipelineId: pipeline.id, stageId: openStage.id },
      select: { id: true },
    });

    return { companyId: company.id, ownerId: owner.id, roleId: role.id, dealId: deal.id, wonStageId: wonStage.id };
  });
}

async function makeAutomation(
  companyId: string,
  entityType: (typeof EntityType)[keyof typeof EntityType],
  steps: StepSeed[],
  conditions?: Prisma.InputJsonValue,
): Promise<string> {
  return runWithoutTenant(async () => {
    const automation = await prisma.automation.create({
      data: {
        companyId,
        name: `Work a new ${entityType}`,
        enabled: true,
        entityType,
        triggerKind: AutomationTriggerKind.recordCreated,
        ...(conditions ? { conditions } : {}),
        steps: {
          create: steps.map((step, position) => ({ companyId, position, kind: step.kind, config: step.config })),
        },
      },
      select: { id: true },
    });

    return automation.id;
  });
}

async function admitDealRun(workspace: Workspace, steps: StepSeed[], conditions?: Prisma.InputJsonValue) {
  const automationId = await makeAutomation(workspace.companyId, EntityType.deal, steps, conditions);

  const [run] = await new PrismaAutomationRepo().admitAutomationRunsUnscoped({
    companyId: workspace.companyId,
    automationIds: [automationId],
    entityType: EntityType.deal,
    entityId: workspace.dealId,
    triggerEvent: "deal.created",
    triggerPayload: { entityId: workspace.dealId },
  });
  if (!run) throw new Error("the run was not admitted");

  return run.id;
}

function readRun(runId: string) {
  return runWithoutTenant(() =>
    prisma.automationRun.findUniqueOrThrow({
      where: { id: runId },
      select: {
        status: true,
        finishedAt: true,
        steps: {
          select: { id: true, status: true, output: true, error: true, startedAt: true, finishedAt: true },
          orderBy: { position: "asc" },
        },
      },
    }),
  );
}

type RunStep = Awaited<ReturnType<typeof readRun>>["steps"][number];

function neverStarted(step: RunStep | undefined) {
  return (
    step !== undefined &&
    step.startedAt === null &&
    step.output === null &&
    step.status !== AutomationRunStatus.running &&
    step.status !== AutomationRunStatus.succeeded
  );
}

async function firstStepOf(runId: string) {
  const [step] = (await readRun(runId)).steps;
  if (!step) throw new Error("the run has no step");

  return step;
}

function tasksOf(companyId: string) {
  return runWithoutTenant(() =>
    prisma.task.findMany({
      where: { companyId },
      select: { id: true, name: true, deals: { select: { dealId: true } } },
    }),
  );
}

function workflowErrorsIn(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.filter(([label]) => label === "[workflow:run-automation]");
}

const CREATE_TASK: StepSeed = {
  kind: AutomationActionKind.createTask,
  config: {
    name: "Call about the new deal",
    activityKind: null,
    dueInDays: 2,
    assigneeUserId: null,
    linkToTriggerRecord: true,
  },
};

describeDatabase("running an automation through its workflow as the owning user", { timeout: 30_000 }, () => {
  const dispatched: Array<{ id: string; payload: unknown }> = [];

  beforeEach(() => {
    dispatched.length = 0;
    vi.spyOn(BackgroundTaskService.prototype, "dispatch").mockImplementation((id: string, payload: unknown) => {
      dispatched.push({ id, payload });

      return Promise.resolve();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await runWithoutTenant(async () => {
      for (const companyId of companyIds) await prisma.company.delete({ where: { id: companyId } });
    });
    await prisma.$disconnect();
  });

  it("runs every step of a run whose record meets its conditions, each under the owner's tenant", async () => {
    const workspace = await makeWorkspace("Acme expansion");
    const taskAutomationId = await makeAutomation(workspace.companyId, EntityType.task, [
      { kind: AutomationActionKind.createNote, config: { body: "must not run for an automation's own task" } },
    ]);
    const runId = await admitDealRun(
      workspace,
      [
        { kind: AutomationActionKind.createNote, config: { body: "Picked up by an automation" } },
        CREATE_TASK,
        { kind: AutomationActionKind.moveStage, config: { stageId: workspace.wonStageId } },
      ],
      [{ field: "name", operator: "contains", value: "Acme" }],
    );

    await runAutomation({ automationRunId: runId, companyId: workspace.companyId });

    const run = await readRun(runId);
    expect(run.status).toBe(AutomationRunStatus.succeeded);
    expect(run.finishedAt).not.toBeNull();
    expect(run.steps.map((step) => step.status)).toEqual([
      AutomationRunStatus.succeeded,
      AutomationRunStatus.succeeded,
      AutomationRunStatus.succeeded,
    ]);

    const deal = await runWithoutTenant(() =>
      prisma.deal.findUniqueOrThrow({ where: { id: workspace.dealId }, select: { notes: true, stageId: true } }),
    );
    expect(serializeJSONToMarkdown(deal.notes as object)).toContain("Picked up by an automation");
    expect(deal.stageId).toBe(workspace.wonStageId);

    const tasks = await tasksOf(workspace.companyId);
    expect(tasks.map((task) => task.name)).toEqual(["Call about the new deal"]);
    expect(tasks[0]?.deals.map((link) => link.dealId)).toEqual([workspace.dealId]);
    expect(run.steps[1]?.output).toEqual({ taskId: tasks[0]?.id });

    const audit = await runWithoutTenant(() =>
      prisma.auditLog.findMany({ where: { companyId: workspace.companyId }, select: { event: true, userId: true } }),
    );
    expect(audit.map((row) => row.event)).toEqual(expect.arrayContaining(["task.created", "deal.updated"]));
    expect(new Set(audit.map((row) => row.userId))).toEqual(new Set([workspace.ownerId]));

    const causedRuns = await runWithoutTenant(() =>
      prisma.automationRun.findMany({ where: { automationId: taskAutomationId } }),
    );
    expect(causedRuns).toEqual([]);
    expect(dispatched).toEqual([]);
  });

  it("skips a run whose record misses its conditions without running a step", async () => {
    const workspace = await makeWorkspace("Acme expansion");
    const runId = await admitDealRun(
      workspace,
      [CREATE_TASK],
      [{ field: "name", operator: "contains", value: "Globex" }],
    );

    await runAutomation({ automationRunId: runId, companyId: workspace.companyId });

    const run = await readRun(runId);
    expect(run.status).toBe(AutomationRunStatus.skipped);
    expect(neverStarted(run.steps[0])).toBe(true);
    expect(await tasksOf(workspace.companyId)).toEqual([]);
  });

  it("fails the step and the run when an action throws, and reports the unexpected error", async () => {
    const workspace = await makeWorkspace("Acme expansion");
    const runId = await admitDealRun(workspace, [
      {
        kind: AutomationActionKind.callWebhook,
        config: { url: "https://hooks.example.invalid/automation", includeRecord: true },
      },
      CREATE_TASK,
    ]);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await runAutomation({ automationRunId: runId, companyId: workspace.companyId });

    const run = await readRun(runId);
    expect(run.status).toBe(AutomationRunStatus.failed);
    expect(run.finishedAt).not.toBeNull();
    expect(run.steps[0]).toMatchObject({ status: AutomationRunStatus.failed, error: "unexpectedError" });
    expect(run.steps[0]?.finishedAt).not.toBeNull();
    expect(neverStarted(run.steps[1])).toBe(true);
    expect(await tasksOf(workspace.companyId)).toEqual([]);
    expect(workflowErrorsIn(errors).map(([, error]) => (error as Error).message)).toEqual(["fetch failed"]);
  });

  it("names a permission the owner lacks, instead of reporting it as unexpected", async () => {
    const workspace = await makeWorkspace("Acme expansion", WITHOUT_TASK_CREATE);
    const runId = await admitDealRun(workspace, [CREATE_TASK]);
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await runAutomation({ automationRunId: runId, companyId: workspace.companyId });

    const run = await readRun(runId);
    expect(run.status).toBe(AutomationRunStatus.failed);
    expect(run.steps[0]).toMatchObject({ status: AutomationRunStatus.failed, error: "ownerNotPermitted" });
    expect(await tasksOf(workspace.companyId)).toEqual([]);
    expect(workflowErrorsIn(errors)).toEqual([]);
  });

  it("names an owner who is no longer active, instead of reporting it as unexpected", async () => {
    const workspace = await makeWorkspace("Acme expansion");
    const inactiveOwnerId = await runWithoutTenant(async () => {
      const user = await prisma.user.create({
        data: {
          companyId: workspace.companyId,
          roleId: workspace.roleId,
          email: `former-owner-${workspace.companyId}@example.invalid`,
          firstName: "Former",
          lastName: "Owner",
          status: "inactive",
        },
        select: { id: true },
      });

      return user.id;
    });
    const runId = await admitDealRun(workspace, [CREATE_TASK]);
    const step = await firstStepOf(runId);
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await executeStep(runId, step.id, inactiveOwnerId)).toBe(false);

    expect(await firstStepOf(runId)).toMatchObject({ status: AutomationRunStatus.failed, error: "ownerInactive" });
    expect(await tasksOf(workspace.companyId)).toEqual([]);
    expect(workflowErrorsIn(errors)).toEqual([]);
  });

  it("names an owner who no longer exists as a missing record", async () => {
    const workspace = await makeWorkspace("Acme expansion");
    const runId = await admitDealRun(workspace, [CREATE_TASK]);
    const step = await firstStepOf(runId);
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await executeStep(runId, step.id, randomUUID())).toBe(false);

    expect(await firstStepOf(runId)).toMatchObject({ status: AutomationRunStatus.failed, error: "recordMissing" });
    expect(await tasksOf(workspace.companyId)).toEqual([]);
    expect(workflowErrorsIn(errors)).toEqual([]);
  });

  it("never runs an action twice when the runtime retries a step whose bookkeeping failed", async () => {
    const workspace = await makeWorkspace("Acme expansion");
    const runId = await admitDealRun(workspace, [CREATE_TASK]);
    const step = await firstStepOf(runId);
    vi.spyOn(ExecuteAutomationStepInteractor.prototype, "finish").mockRejectedValueOnce(new Error("connection reset"));

    const attempts = await runStepLikeTheWorkflowRuntime(executeStep, runId, step.id, workspace.ownerId);

    expect((await tasksOf(workspace.companyId)).map((task) => task.name)).toEqual(["Call about the new deal"]);
    expect(attempts).toEqual({ attempts: 2, failed: false, value: false });
    const settled = await firstStepOf(runId);
    expect(settled).toMatchObject({ status: AutomationRunStatus.failed, error: "interrupted" });
    expect(settled.finishedAt).not.toBeNull();
  });

  it("settles a step whose claim reply was lost as interrupted, without running its action", async () => {
    const workspace = await makeWorkspace("Acme expansion");
    const runId = await admitDealRun(workspace, [CREATE_TASK]);
    const step = await firstStepOf(runId);
    const committing = new PrismaAutomationRepo();
    vi.spyOn(PrismaAutomationRepo.prototype, "claimRunStepUnscoped").mockImplementationOnce(async (args) => {
      await committing.claimRunStepUnscoped(args);

      throw new Error("connection reset after commit");
    });

    const attempts = await runStepLikeTheWorkflowRuntime(executeStep, runId, step.id, workspace.ownerId);

    expect(attempts).toEqual({ attempts: 2, failed: false, value: false });
    expect(await tasksOf(workspace.companyId)).toEqual([]);
    const settled = await firstStepOf(runId);
    expect(settled).toMatchObject({ status: AutomationRunStatus.failed, error: "interrupted" });
    expect(settled.finishedAt).not.toBeNull();
  });
});
