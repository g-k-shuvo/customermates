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
const { runWithoutTenant, runWithTenant } = await import("@/core/decorators/tenant-context");
const { createMockUser } = await import("@/tests/helpers/mock-user");
const { AutomationActionKind, EntityType } = await import("@/generated/prisma");
const { CrmAutomationActionExecutor } = await import("@/features/automation/run/crm-automation-action-executor");
const { PrismaAutomationRecordWriter } = await import("@/features/automation/run/prisma-automation-record-writer");
const di = await import("@/core/di");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companyIds: string[] = [];

const sentEmails: Array<{ to: string; subject: string; body: string }> = [];
const webhookCalls: string[] = [];

const emailSenderStub = {
  send: (args: { to: string; subject: string; body: string }) => {
    sentEmails.push(args);

    return Promise.resolve(true);
  },
};

function executor() {
  return new CrmAutomationActionExecutor(
    new PrismaAutomationRecordWriter(),
    di.getCreateTaskInteractor(),
    di.getCreateDealInteractor(),
    di.getCreateLeadInteractor(),
    di.getUpdateDealInteractor(),
    emailSenderStub as never,
  );
}

async function makeWorkspace() {
  return runWithoutTenant(async () => {
    const company = await prisma.company.create({ data: {} });
    companyIds.push(company.id);

    const role = await prisma.userRole.create({
      data: { companyId: company.id, name: "Admin", isSystemRole: true },
      select: { id: true },
    });
    const user = await prisma.user.create({
      data: {
        companyId: company.id,
        roleId: role.id,
        email: `owner-${company.id}@example.invalid`,
        firstName: "Owner",
        lastName: "User",
        status: "active",
      },
      select: { id: true },
    });

    return { companyId: company.id, userId: user.id, roleId: role.id };
  });
}

function tenantUser(workspace: { companyId: string; userId: string; roleId: string }) {
  return createMockUser({
    id: workspace.userId,
    companyId: workspace.companyId,
    role: { id: workspace.roleId, name: "Admin", isSystemRole: true, permissions: [] } as never,
  });
}

async function runAction(
  workspace: { companyId: string; userId: string; roleId: string },
  kind: string,
  config: unknown,
  context: { entityType: EntityTypeValue | null; entityId: string | null },
) {
  return runWithTenant(tenantUser(workspace), () =>
    executor().execute({
      kind,
      config,
      context: {
        run: {
          runId: "00000000-0000-4000-8000-000000000001",
          automationId: "00000000-0000-4000-8000-000000000002",
          automationName: "Matrix",
          companyId: workspace.companyId,
          entityType: context.entityType,
          entityId: context.entityId,
          triggerEvent: "deal.created",
          conditions: null,
          steps: [],
        },
        entityType: context.entityType,
        entityId: context.entityId,
      },
    }),
  );
}

type EntityTypeValue = (typeof EntityType)[keyof typeof EntityType];

describeDatabase("every action an automation can run", () => {
  afterAll(async () => {
    await runWithoutTenant(async () => {
      for (const companyId of companyIds) await prisma.company.delete({ where: { id: companyId } });
    });
    await prisma.$disconnect();
  });

  it("updateField sets an allowed field on the trigger record", async () => {
    const workspace = await makeWorkspace();
    const deal = await runWithoutTenant(() =>
      prisma.deal.create({ data: { companyId: workspace.companyId, name: "Before" }, select: { id: true } }),
    );

    const outcome = await runAction(
      workspace,
      AutomationActionKind.updateField,
      { field: "name", value: "After" },
      { entityType: EntityType.deal, entityId: deal.id },
    );

    expect(outcome.ok).toBe(true);
    const after = await runWithoutTenant(() => prisma.deal.findUnique({ where: { id: deal.id } }));
    expect(after?.name).toBe("After");
  });

  it("updateField refuses a field outside the allowlist", async () => {
    const workspace = await makeWorkspace();
    const deal = await runWithoutTenant(() =>
      prisma.deal.create({ data: { companyId: workspace.companyId, name: "Guarded" }, select: { id: true } }),
    );

    const outcome = await runAction(
      workspace,
      AutomationActionKind.updateField,
      { field: "companyId", value: "00000000-0000-4000-8000-00000000dead" },
      { entityType: EntityType.deal, entityId: deal.id },
    );

    expect(outcome.ok).toBe(false);
  });

  it("assignOwner writes the owner column on a lead", async () => {
    const workspace = await makeWorkspace();
    const lead = await runWithoutTenant(() =>
      prisma.lead.create({ data: { companyId: workspace.companyId, title: "Owned" }, select: { id: true } }),
    );

    const outcome = await runAction(
      workspace,
      AutomationActionKind.assignOwner,
      { userId: workspace.userId },
      { entityType: EntityType.lead, entityId: lead.id },
    );

    expect(outcome.ok).toBe(true);
    const after = await runWithoutTenant(() => prisma.lead.findUnique({ where: { id: lead.id } }));
    expect(after?.ownerUserId).toBe(workspace.userId);
  });

  it("assignOwner writes the join row on a deal", async () => {
    const workspace = await makeWorkspace();
    const deal = await runWithoutTenant(() =>
      prisma.deal.create({ data: { companyId: workspace.companyId, name: "Assigned" }, select: { id: true } }),
    );

    const outcome = await runAction(
      workspace,
      AutomationActionKind.assignOwner,
      { userId: workspace.userId },
      { entityType: EntityType.deal, entityId: deal.id },
    );

    expect(outcome.ok).toBe(true);
    const links = await runWithoutTenant(() => prisma.dealUser.findMany({ where: { dealId: deal.id } }));
    expect(links.map(({ userId }) => userId)).toEqual([workspace.userId]);
  });

  it("addLabel appends labels to a lead without losing the existing ones", async () => {
    const workspace = await makeWorkspace();
    const lead = await runWithoutTenant(() =>
      prisma.lead.create({
        data: { companyId: workspace.companyId, title: "Labelled", labels: ["existing"] },
        select: { id: true },
      }),
    );

    const outcome = await runAction(
      workspace,
      AutomationActionKind.addLabel,
      { labels: ["added"] },
      { entityType: EntityType.lead, entityId: lead.id },
    );

    expect(outcome.ok).toBe(true);
    const after = await runWithoutTenant(() => prisma.lead.findUnique({ where: { id: lead.id } }));
    expect(after?.labels.toSorted()).toEqual(["added", "existing"]);
  });

  it("addLabel refuses a record that is not a lead", async () => {
    const workspace = await makeWorkspace();
    const deal = await runWithoutTenant(() =>
      prisma.deal.create({ data: { companyId: workspace.companyId, name: "Not a lead" }, select: { id: true } }),
    );

    const outcome = await runAction(
      workspace,
      AutomationActionKind.addLabel,
      { labels: ["nope"] },
      { entityType: EntityType.deal, entityId: deal.id },
    );

    expect(outcome.ok).toBe(false);
  });

  it("createNote writes the note onto the trigger record", async () => {
    const workspace = await makeWorkspace();
    const contact = await runWithoutTenant(() =>
      prisma.contact.create({
        data: { companyId: workspace.companyId, firstName: "Noted", lastName: "Contact" },
        select: { id: true },
      }),
    );

    const outcome = await runAction(
      workspace,
      AutomationActionKind.createNote,
      { body: "written by an automation" },
      { entityType: EntityType.contact, entityId: contact.id },
    );

    expect(outcome.ok).toBe(true);
    const after = await runWithoutTenant(() => prisma.contact.findUnique({ where: { id: contact.id } }));
    expect(after?.notes).toBe("written by an automation");
  });

  it("createTask creates a task linked to the trigger record", async () => {
    const workspace = await makeWorkspace();
    const deal = await runWithoutTenant(() =>
      prisma.deal.create({ data: { companyId: workspace.companyId, name: "Task parent" }, select: { id: true } }),
    );

    const outcome = await runAction(
      workspace,
      AutomationActionKind.createTask,
      { name: "Follow up", activityKind: null, dueInDays: 3, assigneeUserId: null, linkToTriggerRecord: true },
      { entityType: EntityType.deal, entityId: deal.id },
    );

    expect(outcome.ok).toBe(true);
    const links = await runWithoutTenant(() =>
      prisma.taskDeal.findMany({ where: { dealId: deal.id }, select: { task: { select: { name: true } } } }),
    );
    expect(links.map((link) => link.task.name)).toEqual(["Follow up"]);
  });

  it("createDeal creates a standalone deal", async () => {
    const workspace = await makeWorkspace();

    const outcome = await runAction(
      workspace,
      AutomationActionKind.createDeal,
      { name: "Made by automation", pipelineId: null, stageId: null, ownerUserId: null },
      { entityType: null, entityId: null },
    );

    expect(outcome.ok).toBe(true);
    const deals = await runWithoutTenant(() =>
      prisma.deal.findMany({ where: { companyId: workspace.companyId, name: "Made by automation" } }),
    );
    expect(deals).toHaveLength(1);
  });

  it("createLead creates a standalone lead", async () => {
    const workspace = await makeWorkspace();

    const outcome = await runAction(
      workspace,
      AutomationActionKind.createLead,
      { title: "Lead by automation", ownerUserId: null, labels: [] },
      { entityType: null, entityId: null },
    );

    expect(outcome.ok).toBe(true);
    const leads = await runWithoutTenant(() =>
      prisma.lead.findMany({ where: { companyId: workspace.companyId, title: "Lead by automation" } }),
    );
    expect(leads).toHaveLength(1);
  });

  it("moveStage moves a deal into the named stage", async () => {
    const workspace = await makeWorkspace();
    const { dealId, stageId } = await runWithoutTenant(async () => {
      const pipeline = await prisma.pipeline.create({
        data: { companyId: workspace.companyId, name: "Sales", position: 0 },
        select: { id: true },
      });
      const stage = await prisma.pipelineStage.create({
        data: { companyId: workspace.companyId, pipelineId: pipeline.id, name: "Won", position: 0, kind: "open" },
        select: { id: true },
      });
      const deal = await prisma.deal.create({
        data: { companyId: workspace.companyId, name: "Moving", pipelineId: pipeline.id },
        select: { id: true },
      });

      return { dealId: deal.id, stageId: stage.id };
    });

    const outcome = await runAction(
      workspace,
      AutomationActionKind.moveStage,
      { stageId },
      { entityType: EntityType.deal, entityId: dealId },
    );

    expect(outcome.ok).toBe(true);
    const after = await runWithoutTenant(() => prisma.deal.findUnique({ where: { id: dealId } }));
    expect(after?.stageId).toBe(stageId);
  });

  it("moveStage refuses a record that is not a deal", async () => {
    const workspace = await makeWorkspace();
    const lead = await runWithoutTenant(() =>
      prisma.lead.create({ data: { companyId: workspace.companyId, title: "Not a deal" }, select: { id: true } }),
    );

    const outcome = await runAction(
      workspace,
      AutomationActionKind.moveStage,
      { stageId: "00000000-0000-4000-8000-000000000099" },
      { entityType: EntityType.lead, entityId: lead.id },
    );

    expect(outcome.ok).toBe(false);
  });

  it("sendEmail hands the message to the sender", async () => {
    const workspace = await makeWorkspace();
    sentEmails.length = 0;

    const outcome = await runAction(
      workspace,
      AutomationActionKind.sendEmail,
      { to: "someone@example.invalid", subject: "Hello", body: "From an automation" },
      { entityType: null, entityId: null },
    );

    expect(outcome.ok).toBe(true);
    expect(sentEmails).toEqual([{ to: "someone@example.invalid", subject: "Hello", body: "From an automation" }]);
  });

  it("callWebhook posts the run envelope and reports a refusal", async () => {
    const workspace = await makeWorkspace();
    webhookCalls.length = 0;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((url: string) => {
      webhookCalls.push(String(url));

      return Promise.resolve({ ok: true, status: 200 } as Response);
    }) as typeof fetch;

    const accepted = await runAction(
      workspace,
      AutomationActionKind.callWebhook,
      { url: "https://example.invalid/hook", includeRecord: true },
      { entityType: null, entityId: null },
    );

    globalThis.fetch = (() => Promise.resolve({ ok: false, status: 500 } as Response)) as typeof fetch;

    const refused = await runAction(
      workspace,
      AutomationActionKind.callWebhook,
      { url: "https://example.invalid/hook", includeRecord: false },
      { entityType: null, entityId: null },
    );

    globalThis.fetch = originalFetch;

    expect(accepted.ok).toBe(true);
    expect(webhookCalls).toEqual(["https://example.invalid/hook"]);
    expect(refused.ok).toBe(false);
  });

  it("refuses an action whose configuration does not parse", async () => {
    const workspace = await makeWorkspace();

    const outcome = await runAction(
      workspace,
      AutomationActionKind.sendEmail,
      { to: "not an email", subject: "", body: "" },
      { entityType: null, entityId: null },
    );

    expect(outcome.ok).toBe(false);
  });

  it("refuses an entity-scoped action when the trigger carried no record", async () => {
    const workspace = await makeWorkspace();

    const outcome = await runAction(
      workspace,
      AutomationActionKind.updateField,
      { field: "name", value: "orphan" },
      { entityType: null, entityId: null },
    );

    expect(outcome.ok).toBe(false);
  });
});
