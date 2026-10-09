import type { AutomationEmail } from "@/features/automation/run/automation-email-sender";
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
const { runWithoutTenant, runWithTenant } = await import("@/core/decorators/tenant-context");
const { createMockUser } = await import("@/tests/helpers/mock-user");
const { AutomationActionKind, EntityType } = await import("@/generated/prisma");
const { CrmAutomationActionExecutor } = await import("@/features/automation/run/crm-automation-action-executor");
const { PrismaAutomationRecordWriter } = await import("@/features/automation/run/prisma-automation-record-writer");
const { parseMarkdownToJSON, serializeJSONToMarkdown } = await import("@/components/editor/editor.utils");
const di = await import("@/core/di");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companyIds: string[] = [];

const sentEmails: AutomationEmail[] = [];
const webhookCalls: string[] = [];

const emailSenderStub = {
  send: (args: AutomationEmail) => {
    sentEmails.push(args);

    return Promise.resolve({ sent: true as const, to: "someone@example.invalid", duplicate: false });
  },
};

function executor(allowPrivateWebhookTargets = true) {
  return new CrmAutomationActionExecutor(
    new PrismaAutomationRecordWriter(di.getCustomColumnRepo()),
    di.getCreateTaskInteractor(),
    di.getCreateDealInteractor(),
    di.getCreateLeadInteractor(),
    di.getUpdateDealInteractor(),
    emailSenderStub as never,
    allowPrivateWebhookTargets,
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
  context: { entityType: EntityTypeValue | null; entityId: string | null; triggerEvent?: string },
  options: { guardWebhookTargets?: boolean } = {},
) {
  return runWithTenant(tenantUser(workspace), () =>
    executor(!options.guardWebhookTargets).execute({
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
          triggerEvent: context.triggerEvent ?? "deal.created",
          conditions: null,
          steps: [],
        },
        runStepId: "00000000-0000-4000-8000-000000000003",
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

  it("updateField writes a numeric field given as text", async () => {
    const workspace = await makeWorkspace();
    const deal = await runWithoutTenant(() =>
      prisma.deal.create({ data: { companyId: workspace.companyId, name: "Numeric" }, select: { id: true } }),
    );

    const outcome = await runAction(
      workspace,
      AutomationActionKind.updateField,
      { field: "probability", value: "50" },
      { entityType: EntityType.deal, entityId: deal.id },
    );

    expect(outcome.ok).toBe(true);
    const after = await runWithoutTenant(() => prisma.deal.findUnique({ where: { id: deal.id } }));
    expect(after?.probability).toBe(50);
  });

  it("updateField refuses a numeric field given something that is not a number", async () => {
    const workspace = await makeWorkspace();
    const deal = await runWithoutTenant(() =>
      prisma.deal.create({ data: { companyId: workspace.companyId, name: "Rejected" }, select: { id: true } }),
    );

    const outcome = await runAction(
      workspace,
      AutomationActionKind.updateField,
      { field: "probability", value: "quite likely" },
      { entityType: EntityType.deal, entityId: deal.id },
    );

    expect(outcome.ok).toBe(false);
    const after = await runWithoutTenant(() => prisma.deal.findUnique({ where: { id: deal.id } }));
    expect(after?.probability).toBeNull();
  });

  it("assignOwner keeps the assignees the deal already has", async () => {
    const workspace = await makeWorkspace();
    const { deal, existing } = await runWithoutTenant(async () => {
      const created = await prisma.deal.create({
        data: { companyId: workspace.companyId, name: "Shared" },
        select: { id: true },
      });
      const other = await prisma.user.create({
        data: {
          companyId: workspace.companyId,
          roleId: workspace.roleId,
          email: `colleague-${created.id}@example.invalid`,
          firstName: "Colleague",
          lastName: "User",
          status: "active",
        },
        select: { id: true },
      });
      await prisma.dealUser.create({
        data: { companyId: workspace.companyId, dealId: created.id, userId: other.id },
      });

      return { deal: created, existing: other.id };
    });

    const outcome = await runAction(
      workspace,
      AutomationActionKind.assignOwner,
      { userId: workspace.userId },
      { entityType: EntityType.deal, entityId: deal.id },
    );

    expect(outcome.ok).toBe(true);
    const links = await runWithoutTenant(() => prisma.dealUser.findMany({ where: { dealId: deal.id } }));
    expect(links.map(({ userId }) => userId).sort()).toEqual([existing, workspace.userId].sort());
  });

  it("assignOwner assigning the same user twice leaves one join row", async () => {
    const workspace = await makeWorkspace();
    const deal = await runWithoutTenant(() =>
      prisma.deal.create({ data: { companyId: workspace.companyId, name: "Twice" }, select: { id: true } }),
    );
    const config = { userId: workspace.userId };
    const target = { entityType: EntityType.deal, entityId: deal.id };

    expect((await runAction(workspace, AutomationActionKind.assignOwner, config, target)).ok).toBe(true);
    expect((await runAction(workspace, AutomationActionKind.assignOwner, config, target)).ok).toBe(true);

    const links = await runWithoutTenant(() => prisma.dealUser.findMany({ where: { dealId: deal.id } }));
    expect(links).toHaveLength(1);
  });

  it("assignOwner refuses a step that configured no user", async () => {
    const workspace = await makeWorkspace();
    const deal = await runWithoutTenant(() =>
      prisma.deal.create({ data: { companyId: workspace.companyId, name: "Unconfigured" }, select: { id: true } }),
    );
    await runWithoutTenant(() =>
      prisma.dealUser.create({ data: { companyId: workspace.companyId, dealId: deal.id, userId: workspace.userId } }),
    );

    const outcome = await runAction(
      workspace,
      AutomationActionKind.assignOwner,
      { userId: null },
      { entityType: EntityType.deal, entityId: deal.id },
    );

    expect(outcome.ok).toBe(false);
    const links = await runWithoutTenant(() => prisma.dealUser.findMany({ where: { dealId: deal.id } }));
    expect(links).toHaveLength(1);
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
    expect(typeof after?.notes).toBe("object");
    expect(serializeJSONToMarkdown(after?.notes as object)).toContain("written by an automation");
  });

  it("createNote keeps the note the record already carries", async () => {
    const workspace = await makeWorkspace();
    const contact = await runWithoutTenant(() =>
      prisma.contact.create({
        data: {
          companyId: workspace.companyId,
          firstName: "Noted",
          lastName: "Before",
          notes: parseMarkdownToJSON("written by a person") as never,
        },
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
    const markdown = serializeJSONToMarkdown(after?.notes as object);
    expect(markdown).toContain("written by a person");
    expect(markdown).toContain("written by an automation");
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

  it("createTask leaves the task unlinked when the trigger record was deleted", async () => {
    const workspace = await makeWorkspace();

    const outcome = await runAction(
      workspace,
      AutomationActionKind.createTask,
      {
        name: "Org removed follow-up",
        activityKind: null,
        dueInDays: null,
        assigneeUserId: null,
        linkToTriggerRecord: true,
      },
      {
        entityType: EntityType.organization,
        entityId: "00000000-0000-4000-8000-0000000000ff",
        triggerEvent: "organization.deleted",
      },
    );

    expect(outcome.ok).toBe(true);
    const tasks = await runWithoutTenant(() =>
      prisma.task.findMany({
        where: { companyId: workspace.companyId, name: "Org removed follow-up" },
        select: { organizations: true },
      }),
    );
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.organizations).toEqual([]);
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

  it("updateField writes a custom field, coercing a number and validating the column type", async () => {
    const workspace = await makeWorkspace();
    const { contact, budget, tier, period } = await runWithoutTenant(async () => ({
      contact: await prisma.contact.create({
        data: { companyId: workspace.companyId, firstName: "Custom", lastName: "Fields" },
        select: { id: true },
      }),
      budget: await prisma.customColumn.create({
        data: { companyId: workspace.companyId, label: "Budget", type: "currency", entityType: EntityType.contact },
        select: { id: true },
      }),
      tier: await prisma.customColumn.create({
        data: {
          companyId: workspace.companyId,
          label: "Tier",
          type: "singleSelect",
          entityType: EntityType.contact,
          options: {
            options: [
              {
                value: "5d4f3b8e-1c2a-4d6e-8f90-a1b2c3d4e5f6",
                label: "Gold",
                color: "default",
                isDefault: false,
                index: 0,
              },
            ],
          },
        },
        select: { id: true },
      }),
      period: await prisma.customColumn.create({
        data: { companyId: workspace.companyId, label: "Period", type: "dateRange", entityType: EntityType.contact },
        select: { id: true },
      }),
    }));
    const on = { entityType: EntityType.contact, entityId: contact.id };
    const write = (field: string, value: unknown) =>
      runAction(workspace, AutomationActionKind.updateField, { field, value }, on);

    expect(await write(budget.id, 1500)).toEqual({ ok: true, output: { field: budget.id } });
    expect(await write(tier.id, "5d4f3b8e-1c2a-4d6e-8f90-a1b2c3d4e5f6")).toEqual({
      ok: true,
      output: { field: tier.id },
    });
    expect(await write(tier.id, "Platinum")).toEqual({ ok: false, error: "fieldValueInvalid" });
    expect(await write(budget.id, "a lot")).toEqual({ ok: false, error: "fieldValueInvalid" });
    expect(await write(period.id, "2026-01-01")).toEqual({ ok: false, error: "fieldNotWritable" });
    expect(await write("00000000-0000-4000-8000-0000000000aa", "x")).toEqual({ ok: false, error: "fieldNotWritable" });

    const values = await runWithoutTenant(() =>
      prisma.customFieldValue.findMany({
        where: { contactId: contact.id },
        select: { columnId: true, value: true, numericValue: true },
      }),
    );
    expect(values.find((row) => row.columnId === budget.id)).toMatchObject({ value: "1500" });
    expect(Number(values.find((row) => row.columnId === budget.id)?.numericValue)).toBe(1500);
    expect(values.find((row) => row.columnId === tier.id)?.value).toBe("5d4f3b8e-1c2a-4d6e-8f90-a1b2c3d4e5f6");

    expect(await write(budget.id, null)).toEqual({ ok: true, output: { field: budget.id } });
    const cleared = await runWithoutTenant(() =>
      prisma.customFieldValue.count({ where: { contactId: contact.id, columnId: budget.id } }),
    );
    expect(cleared).toBe(0);
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

  it("sendEmail lifts a stored literal address and hands the message to the sender", async () => {
    const workspace = await makeWorkspace();
    sentEmails.length = 0;

    const outcome = await runAction(
      workspace,
      AutomationActionKind.sendEmail,
      { to: "someone@example.invalid", subject: "Hello", body: "From an automation" },
      { entityType: null, entityId: null },
    );

    expect(outcome.ok).toBe(true);
    expect(sentEmails).toEqual([
      {
        recipient: { kind: "address", address: "someone@example.invalid" },
        subject: "Hello",
        body: "From an automation",
        bannerUrl: null,
        runStepId: "00000000-0000-4000-8000-000000000003",
        record: null,
      },
    ]);
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

    globalThis.fetch = (() => Promise.reject(new TypeError("fetch failed"))) as typeof fetch;

    const unreachable = await runAction(
      workspace,
      AutomationActionKind.callWebhook,
      { url: "https://example.invalid/hook", includeRecord: false },
      { entityType: null, entityId: null },
    );

    globalThis.fetch = originalFetch;

    expect(accepted.ok).toBe(true);
    expect(webhookCalls).toEqual(["https://example.invalid/hook"]);
    expect(refused).toEqual({ ok: false, error: "webhookRejected" });
    expect(unreachable).toEqual({ ok: false, error: "webhookUnreachable" });
  });

  it("callWebhook refuses a private target without sending anything", async () => {
    const workspace = await makeWorkspace();
    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.fn(() => Promise.resolve({ ok: true, status: 200 } as Response));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const outcome = await runAction(
      workspace,
      AutomationActionKind.callWebhook,
      { url: "http://169.254.169.254/latest/meta-data", includeRecord: false },
      { entityType: null, entityId: null },
      { guardWebhookTargets: true },
    );

    globalThis.fetch = originalFetch;

    expect(outcome).toEqual({ ok: false, error: "webhookTargetRefused" });
    expect(fetchSpy).not.toHaveBeenCalled();
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

  it("createNote folds a bare string the old writer left into the document", async () => {
    const workspace = await makeWorkspace();
    const contact = await runWithoutTenant(() =>
      prisma.contact.create({
        data: {
          companyId: workspace.companyId,
          firstName: "Bare",
          lastName: "String",
          notes: "left by the old writer",
        },
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
    expect(after?.notes).toEqual({
      type: "doc",
      content: [paragraph("left by the old writer"), paragraph("written by an automation")],
    });
  });

  it("createNote folds a web form message object, keeping the message literal", async () => {
    const workspace = await makeWorkspace();
    const lead = await runWithoutTenant(() =>
      prisma.lead.create({
        data: {
          companyId: workspace.companyId,
          title: "From the website",
          notes: { message: "Call me back\n[prize](https://evil.test)" },
        },
        select: { id: true },
      }),
    );

    const outcome = await runAction(
      workspace,
      AutomationActionKind.createNote,
      { body: "qualified by an automation" },
      { entityType: EntityType.lead, entityId: lead.id, triggerEvent: "lead.created" },
    );

    expect(outcome.ok).toBe(true);
    const after = await runWithoutTenant(() => prisma.lead.findUnique({ where: { id: lead.id } }));
    expect(after?.notes).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Call me back" },
            { type: "hardBreak" },
            { type: "text", text: "[prize](https://evil.test)" },
          ],
        },
        paragraph("qualified by an automation"),
      ],
    });
  });

  it("createNote refuses notes it cannot read and leaves them untouched", async () => {
    const workspace = await makeWorkspace();
    const unreadable = { legacy: { body: "kept as it was" } };
    const deal = await runWithoutTenant(() =>
      prisma.deal.create({
        data: { companyId: workspace.companyId, name: "Unreadable", notes: unreadable },
        select: { id: true },
      }),
    );

    const outcome = await runAction(
      workspace,
      AutomationActionKind.createNote,
      { body: "must not replace them" },
      { entityType: EntityType.deal, entityId: deal.id },
    );

    expect(outcome).toEqual({ ok: false, error: "notesUnreadable" });
    const after = await runWithoutTenant(() => prisma.deal.findUnique({ where: { id: deal.id } }));
    expect(after?.notes).toEqual(unreadable);
  });

  it("createNote keeps underline and the link target of the notes it appends to", async () => {
    const workspace = await makeWorkspace();
    const rich = {
      type: "paragraph",
      content: [
        { type: "text", text: "underlined", marks: [{ type: "underline" }] },
        { type: "text", text: " then " },
        {
          type: "text",
          text: "a link",
          marks: [
            {
              type: "link",
              attrs: { href: "https://example.test/x", target: "_self", rel: "noopener", class: null, title: null },
            },
          ],
        },
      ],
    };
    const task = await runWithoutTenant(() =>
      prisma.task.create({
        data: { companyId: workspace.companyId, type: "custom", name: "Rich", notes: { type: "doc", content: [rich] } },
        select: { id: true },
      }),
    );

    const outcome = await runAction(
      workspace,
      AutomationActionKind.createNote,
      { body: "appended" },
      { entityType: EntityType.task, entityId: task.id, triggerEvent: "task.updated" },
    );

    expect(outcome.ok).toBe(true);
    const after = await runWithoutTenant(() => prisma.task.findUnique({ where: { id: task.id } }));
    expect(after?.notes).toEqual({ type: "doc", content: [rich, paragraph("appended")] });
  });

  it("createNote from automations running at the same time keeps every note", async () => {
    const workspace = await makeWorkspace();
    const contact = await runWithoutTenant(() =>
      prisma.contact.create({
        data: { companyId: workspace.companyId, firstName: "Busy", lastName: "Contact" },
        select: { id: true },
      }),
    );
    const bodies = Array.from({ length: 6 }, (_, index) => `note ${index + 1}`);

    const outcomes = await Promise.all(
      bodies.map((body) =>
        runAction(
          workspace,
          AutomationActionKind.createNote,
          { body },
          { entityType: EntityType.contact, entityId: contact.id, triggerEvent: "contact.updated" },
        ),
      ),
    );

    expect(outcomes.every((outcome) => outcome.ok)).toBe(true);
    const after = await runWithoutTenant(() => prisma.contact.findUnique({ where: { id: contact.id } }));
    const written = ((after?.notes as { content: Array<{ content: Array<{ text: string }> }> }).content ?? []).map(
      (block) => block.content[0].text,
    );
    expect(written.toSorted()).toEqual(bodies);
  });

  it("addLabel from automations running at the same time keeps every label", async () => {
    const workspace = await makeWorkspace();
    const lead = await runWithoutTenant(() =>
      prisma.lead.create({ data: { companyId: workspace.companyId, title: "Popular" }, select: { id: true } }),
    );
    const labels = Array.from({ length: 6 }, (_, index) => `label-${index + 1}`);

    const outcomes = await Promise.all(
      labels.map((label) =>
        runAction(
          workspace,
          AutomationActionKind.addLabel,
          { labels: [label] },
          { entityType: EntityType.lead, entityId: lead.id, triggerEvent: "lead.created" },
        ),
      ),
    );

    expect(outcomes.every((outcome) => outcome.ok)).toBe(true);
    const after = await runWithoutTenant(() => prisma.lead.findUnique({ where: { id: lead.id } }));
    expect(after?.labels.toSorted()).toEqual(labels);
  });

  it("updateField refuses a deal probability above 100, and the deal can still be read", async () => {
    const workspace = await makeWorkspace();
    const deal = await runWithoutTenant(() =>
      prisma.deal.create({ data: { companyId: workspace.companyId, name: "Bounded" }, select: { id: true } }),
    );

    const outcome = await runAction(
      workspace,
      AutomationActionKind.updateField,
      { field: "probability", value: "150" },
      { entityType: EntityType.deal, entityId: deal.id },
    );

    expect(outcome).toEqual({ ok: false, error: "fieldValueInvalid" });
    const stored = await runWithoutTenant(() => prisma.deal.findUnique({ where: { id: deal.id } }));
    expect(stored?.probability).toBeNull();

    const read = await runWithTenant(tenantUser(workspace), () =>
      di.getGetDealByIdInteractor().invoke({ id: deal.id }),
    );
    expect(read.ok && read.data.deal?.id).toBe(deal.id);
  });

  it("updateField on a deal recalculates the weighted value and records the update", async () => {
    const workspace = await makeWorkspace();
    const deal = await runWithoutTenant(async () => {
      const service = await prisma.service.create({
        data: { companyId: workspace.companyId, name: "Licence", amount: 2000 },
        select: { id: true },
      });

      return prisma.deal.create({
        data: {
          companyId: workspace.companyId,
          name: "Weighted",
          totalValue: 2000,
          totalQuantity: 1,
          services: { create: [{ companyId: workspace.companyId, serviceId: service.id, quantity: 1 }] },
        },
        select: { id: true },
      });
    });

    const outcome = await runAction(
      workspace,
      AutomationActionKind.updateField,
      { field: "probability", value: "25" },
      { entityType: EntityType.deal, entityId: deal.id },
    );

    expect(outcome).toEqual({ ok: true, output: { field: "probability" } });
    const after = await runWithoutTenant(() => prisma.deal.findUnique({ where: { id: deal.id } }));
    expect(after?.probability).toBe(25);
    expect(after?.weightedValue).toBe(500);
    const audits = await runWithoutTenant(() =>
      prisma.auditLog.count({ where: { companyId: workspace.companyId, entityId: deal.id, event: "deal.updated" } }),
    );
    expect(audits).toBe(1);
  });

  it("updateField refuses a blank value instead of writing zero", async () => {
    const workspace = await makeWorkspace();
    const { dealId, leadId } = await runWithoutTenant(async () => {
      const deal = await prisma.deal.create({
        data: { companyId: workspace.companyId, name: "Blank", probability: 40 },
        select: { id: true },
      });
      const lead = await prisma.lead.create({
        data: { companyId: workspace.companyId, title: "Blank", value: 900 },
        select: { id: true },
      });

      return { dealId: deal.id, leadId: lead.id };
    });

    const onDeal = await runAction(
      workspace,
      AutomationActionKind.updateField,
      { field: "probability", value: "" },
      { entityType: EntityType.deal, entityId: dealId },
    );
    const onLead = await runAction(
      workspace,
      AutomationActionKind.updateField,
      { field: "value", value: "  " },
      { entityType: EntityType.lead, entityId: leadId, triggerEvent: "lead.updated" },
    );

    expect(onDeal).toEqual({ ok: false, error: "fieldValueMissing" });
    expect(onLead).toEqual({ ok: false, error: "fieldValueMissing" });
    const [deal, lead] = await runWithoutTenant(() =>
      Promise.all([
        prisma.deal.findUnique({ where: { id: dealId } }),
        prisma.lead.findUnique({ where: { id: leadId } }),
      ]),
    );
    expect(deal?.probability).toBe(40);
    expect(lead?.value).toBe(900);
  });

  it("updateField refuses a lead status that is only a key every object inherits", async () => {
    const workspace = await makeWorkspace();
    const lead = await runWithoutTenant(() =>
      prisma.lead.create({ data: { companyId: workspace.companyId, title: "Status" }, select: { id: true } }),
    );

    const outcome = await runAction(
      workspace,
      AutomationActionKind.updateField,
      { field: "status", value: "constructor" },
      { entityType: EntityType.lead, entityId: lead.id, triggerEvent: "lead.updated" },
    );

    expect(outcome).toEqual({ ok: false, error: "fieldValueInvalid" });
    const after = await runWithoutTenant(() => prisma.lead.findUnique({ where: { id: lead.id } }));
    expect(after?.status).toBe("new");
  });

  it("updateField refuses fields with no column and null for a name, without throwing", async () => {
    const workspace = await makeWorkspace();
    const { contactId, organizationId } = await runWithoutTenant(async () => {
      const contact = await prisma.contact.create({
        data: { companyId: workspace.companyId, firstName: "Kept", lastName: "Name" },
        select: { id: true },
      });
      const organization = await prisma.organization.create({
        data: { companyId: workspace.companyId, name: "Kept Ltd" },
        select: { id: true },
      });

      return { contactId: contact.id, organizationId: organization.id };
    });
    const onContact = { entityType: EntityType.contact, entityId: contactId, triggerEvent: "contact.updated" };
    const onOrganization = {
      entityType: EntityType.organization,
      entityId: organizationId,
      triggerEvent: "organization.updated",
    };

    const results = [
      await runAction(workspace, AutomationActionKind.updateField, { field: "jobTitle", value: "CTO" }, onContact),
      await runAction(
        workspace,
        AutomationActionKind.updateField,
        { field: "website", value: "https://kept.test" },
        onOrganization,
      ),
      await runAction(workspace, AutomationActionKind.updateField, { field: "firstName", value: null }, onContact),
      await runAction(workspace, AutomationActionKind.updateField, { field: "name", value: null }, onOrganization),
    ];

    expect(results).toEqual([
      { ok: false, error: "fieldNotWritable" },
      { ok: false, error: "fieldNotWritable" },
      { ok: false, error: "fieldValueMissing" },
      { ok: false, error: "fieldValueMissing" },
    ]);
    const [contact, organization] = await runWithoutTenant(() =>
      Promise.all([
        prisma.contact.findUnique({ where: { id: contactId } }),
        prisma.organization.findUnique({ where: { id: organizationId } }),
      ]),
    );
    expect(contact?.firstName).toBe("Kept");
    expect(organization?.name).toBe("Kept Ltd");
  });

  it("assignOwner refuses a user from another company", async () => {
    const workspace = await makeWorkspace();
    const other = await makeWorkspace();
    const deal = await runWithoutTenant(() =>
      prisma.deal.create({ data: { companyId: workspace.companyId, name: "Foreign" }, select: { id: true } }),
    );

    const outcome = await runAction(
      workspace,
      AutomationActionKind.assignOwner,
      { userId: other.userId },
      { entityType: EntityType.deal, entityId: deal.id },
    );

    expect(outcome).toEqual({ ok: false, error: "assigneeUnavailable" });
    const links = await runWithoutTenant(() => prisma.dealUser.findMany({ where: { dealId: deal.id } }));
    expect(links).toEqual([]);
  });

  it("assignOwner refuses a colleague who is no longer active", async () => {
    const workspace = await makeWorkspace();
    const { leadId, inactiveId } = await runWithoutTenant(async () => {
      const lead = await prisma.lead.create({
        data: { companyId: workspace.companyId, title: "Unowned" },
        select: { id: true },
      });
      const inactive = await prisma.user.create({
        data: {
          companyId: workspace.companyId,
          roleId: workspace.roleId,
          email: `inactive-${lead.id}@example.invalid`,
          firstName: "Former",
          lastName: "Colleague",
          status: "inactive",
        },
        select: { id: true },
      });

      return { leadId: lead.id, inactiveId: inactive.id };
    });

    const outcome = await runAction(
      workspace,
      AutomationActionKind.assignOwner,
      { userId: inactiveId },
      { entityType: EntityType.lead, entityId: leadId, triggerEvent: "lead.created" },
    );

    expect(outcome).toEqual({ ok: false, error: "assigneeUnavailable" });
    const after = await runWithoutTenant(() => prisma.lead.findUnique({ where: { id: leadId } }));
    expect(after?.ownerUserId).toBeNull();
  });

  it("assignOwner reports a record that no longer exists instead of failing on the foreign key", async () => {
    const workspace = await makeWorkspace();
    const missing = "00000000-0000-4000-8000-00000000f00d";

    const onDeal = await runAction(
      workspace,
      AutomationActionKind.assignOwner,
      { userId: workspace.userId },
      { entityType: EntityType.deal, entityId: missing },
    );
    const onLead = await runAction(
      workspace,
      AutomationActionKind.assignOwner,
      { userId: workspace.userId },
      { entityType: EntityType.lead, entityId: missing, triggerEvent: "lead.created" },
    );

    expect(onDeal).toEqual({ ok: false, error: "recordMissing" });
    expect(onLead).toEqual({ ok: false, error: "recordMissing" });
  });
});

function paragraph(text: string) {
  return { type: "paragraph", content: [{ type: "text", text }] };
}
