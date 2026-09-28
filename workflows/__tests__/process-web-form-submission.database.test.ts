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

const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { Action, AutomationActionKind, AutomationTriggerKind, EntityType, Resource } = await import(
  "@/generated/prisma"
);
const { BackgroundTaskService } = await import("@/core/utils/background-task.service");
const { EmailService } = await import("@/features/email/email.service");
const { EventService } = await import("@/features/event/event.service");
const { DomainEvent } = await import("@/features/event/domain-events");
const { getProcessWebFormSubmissionInteractor } = await import("@/core/di");
const { processWebFormSubmission, publishLeadCreated } = await import("@/workflows/process-web-form-submission");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companyIds: string[] = [];

type Company = { companyId: string; adminId: string | null; salesId: string | null; automationId: string };

async function makeCompany(members: { admin?: boolean; sales?: "active" | "inactive" }): Promise<Company> {
  return runWithoutTenant(async () => {
    const company = await prisma.company.create({ data: {} });
    companyIds.push(company.id);

    const addMember = async (kind: "admin" | "sales", status: "active" | "inactive") => {
      const role = await prisma.userRole.create({
        data: {
          companyId: company.id,
          name: kind === "admin" ? "Admin" : "Sales",
          isSystemRole: kind === "admin",
          permissions:
            kind === "sales"
              ? { create: [{ companyId: company.id, resource: Resource.leads, action: Action.readOwn }] }
              : undefined,
        },
        select: { id: true },
      });
      const user = await prisma.user.create({
        data: {
          companyId: company.id,
          roleId: role.id,
          email: `${kind}-${company.id}@example.invalid`,
          firstName: kind === "admin" ? "Company" : "Sales",
          lastName: kind === "admin" ? "Admin" : "Rep",
          status,
        },
        select: { id: true },
      });

      return user.id;
    };

    const adminId = members.admin ? await addMember("admin", "active") : null;
    const salesId = members.sales ? await addMember("sales", members.sales) : null;

    const automation = await prisma.automation.create({
      data: {
        companyId: company.id,
        name: "Label new leads",
        enabled: true,
        entityType: EntityType.lead,
        triggerKind: AutomationTriggerKind.recordCreated,
        steps: {
          create: [
            {
              companyId: company.id,
              position: 0,
              kind: AutomationActionKind.addLabel,
              config: { labels: ["triaged"] },
            },
          ],
        },
      },
      select: { id: true },
    });

    return { companyId: company.id, adminId, salesId, automationId: automation.id };
  });
}

async function makeSource(companyId: string, defaultOwnerId: string | null): Promise<string> {
  return runWithoutTenant(async () => {
    const source = await prisma.webFormSource.create({
      data: {
        companyId,
        name: "Website contact form",
        slug: `website-${companyId}`,
        signingSecret: "vitest-signing-secret",
        defaultOwnerId,
        defaultLabels: ["website"],
        fieldMapping: { email: "fields.email", firstName: "fields.name", message: "fields.message" },
      },
      select: { id: true },
    });

    return source.id;
  });
}

async function submit(companyId: string, sourceId: string): Promise<string> {
  const submission = await runWithoutTenant(() =>
    prisma.webFormSubmission.create({
      data: {
        companyId,
        sourceId,
        rawPayload: {
          fields: { email: `grace-${companyId}@example.invalid`, name: "Grace Hopper", message: "Call me" },
        },
      },
      select: { id: true },
    }),
  );

  return submission.id;
}

function readSubmission(submissionId: string) {
  return runWithoutTenant(() =>
    prisma.webFormSubmission.findUniqueOrThrow({
      where: { id: submissionId },
      select: {
        status: true,
        lead: { select: { id: true, title: true, ownerUserId: true, contactId: true, sourceOrigin: true } },
      },
    }),
  );
}

async function submitAndProcess(companyId: string, sourceId: string) {
  const submissionId = await submit(companyId, sourceId);

  await processWebFormSubmission({ submissionId });

  return readSubmission(submissionId);
}

async function processWithoutPublishing(companyId: string, sourceId: string) {
  const outcome = await getProcessWebFormSubmissionInteractor().invoke({
    submissionId: await submit(companyId, sourceId),
  });
  if (!outcome.ok || !outcome.data.leadId) throw new Error("the submission did not map to a lead");

  return { leadId: outcome.data.leadId, publisherUserId: outcome.data.publisherUserId };
}

function createdLead(submission: Awaited<ReturnType<typeof readSubmission>>) {
  if (!submission.lead) throw new Error("the submission did not map to a lead");

  return submission.lead;
}

function readEffects(companyId: string, leadId: string) {
  return runWithoutTenant(async () => ({
    audit: await prisma.auditLog.findMany({
      where: { companyId, entityId: leadId, event: DomainEvent.LEAD_CREATED },
      select: { userId: true },
    }),
    followUps: await prisma.task.findMany({
      where: { companyId },
      select: {
        name: true,
        users: { select: { userId: true } },
        contacts: { select: { contactId: true } },
      },
    }),
    runs: await prisma.automationRun.findMany({
      where: { companyId, entityId: leadId },
      select: { id: true, automationId: true, triggerEvent: true },
    }),
  }));
}

function anywhereFor(leadId: string) {
  return runWithoutTenant(async () => ({
    audit: await prisma.auditLog.count({ where: { entityId: leadId } }),
    runs: await prisma.automationRun.count({ where: { entityId: leadId } }),
  }));
}

function workflowErrorsIn(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls
    .filter(([label]) => label === "[workflow:process-web-form-submission]")
    .map(([, error]) => (error as Error).message);
}

describeDatabase("publishing lead.created for a web form lead", { timeout: 30_000 }, () => {
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

  it("publishes as the source owner, so the audit row, the follow-up task and the automation all happen", async () => {
    const company = await makeCompany({ sales: "active" });
    const sourceId = await makeSource(company.companyId, company.salesId);

    const submission = await submitAndProcess(company.companyId, sourceId);

    expect(submission.status).toBe("processed");
    expect(submission.lead).toMatchObject({ ownerUserId: company.salesId, sourceOrigin: "webform" });
    const lead = createdLead(submission);

    const { audit, followUps, runs } = await readEffects(company.companyId, lead.id);
    expect(audit).toEqual([{ userId: company.salesId }]);
    expect(followUps).toEqual([
      {
        name: `Follow up: ${lead.title}`,
        users: [{ userId: company.salesId }],
        contacts: [{ contactId: lead.contactId }],
      },
    ]);
    expect(runs).toEqual([
      { id: expect.any(String), automationId: company.automationId, triggerEvent: DomainEvent.LEAD_CREATED },
    ]);
    expect(dispatched).toEqual([
      { id: "run-automation", payload: { automationRunId: runs[0]?.id, companyId: company.companyId } },
    ]);
  });

  it("publishes as a company admin when the source names no owner", async () => {
    const company = await makeCompany({ admin: true });
    const sourceId = await makeSource(company.companyId, null);

    const lead = createdLead(await submitAndProcess(company.companyId, sourceId));
    expect(lead.ownerUserId).toBeNull();

    const { audit, followUps, runs } = await readEffects(company.companyId, lead.id);
    expect(audit).toEqual([{ userId: company.adminId }]);
    expect(followUps).toEqual([
      { name: `Follow up: ${lead.title}`, users: [], contacts: [{ contactId: lead.contactId }] },
    ]);
    expect(runs.map((run) => run.automationId)).toEqual([company.automationId]);
  });

  it("still admits the automation as the system when nobody in the company can act", async () => {
    const company = await makeCompany({});
    const sourceId = await makeSource(company.companyId, null);

    const lead = createdLead(await submitAndProcess(company.companyId, sourceId));
    const { audit, followUps, runs } = await readEffects(company.companyId, lead.id);
    expect(audit).toEqual([]);
    expect(followUps).toEqual([]);
    expect(runs.map((run) => run.automationId)).toEqual([company.automationId]);
    expect(dispatched.map((entry) => entry.id)).toEqual(["run-automation"]);
  });

  it("ignores a source owner from another company and leaks nothing into that company", async () => {
    const mine = await makeCompany({ admin: true });
    const theirs = await makeCompany({ admin: true });
    const sourceId = await makeSource(mine.companyId, theirs.adminId);

    const submission = await submitAndProcess(mine.companyId, sourceId);

    expect(submission.status).toBe("processed");
    const lead = createdLead(submission);
    expect(lead.ownerUserId).toBe(mine.adminId);

    const own = await readEffects(mine.companyId, lead.id);
    expect(own.audit).toEqual([{ userId: mine.adminId }]);
    expect(own.followUps.map((task) => task.users)).toEqual([[{ userId: mine.adminId }]]);
    expect(own.runs.map((run) => run.automationId)).toEqual([mine.automationId]);

    const leaked = await readEffects(theirs.companyId, lead.id);
    expect(leaked).toEqual({ audit: [], followUps: [], runs: [] });
    expect(await anywhereFor(lead.id)).toEqual({ audit: 1, runs: 1 });
    expect(dispatched.map((entry) => (entry.payload as { companyId: string }).companyId)).toEqual([mine.companyId]);
  });

  it("still publishes lead.created when the source owner was deactivated", async () => {
    const company = await makeCompany({ admin: true, sales: "inactive" });
    const sourceId = await makeSource(company.companyId, company.salesId);

    const submission = await submitAndProcess(company.companyId, sourceId);

    const lead = createdLead(submission);
    expect(lead.ownerUserId).toBe(company.adminId);

    const { audit, followUps, runs } = await readEffects(company.companyId, lead.id);
    expect(audit).toEqual([{ userId: company.adminId }]);
    expect(followUps.map((task) => task.users)).toEqual([[{ userId: company.adminId }]]);
    expect(runs.map((run) => run.automationId)).toEqual([company.automationId]);
  });

  it("fans out at most once when a listener fails, and reports the failure", async () => {
    const company = await makeCompany({ sales: "active" });
    const sourceId = await makeSource(company.companyId, company.salesId);
    const { leadId, publisherUserId } = await processWithoutPublishing(company.companyId, sourceId);
    vi.spyOn(EmailService.prototype, "send").mockImplementation(
      () => new Promise<boolean>((_, reject) => setTimeout(() => reject(new Error("smtp connection refused")), 500)),
    );
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const attempts = await runStepLikeTheWorkflowRuntime(
      publishLeadCreated,
      leadId,
      company.companyId,
      publisherUserId,
    );

    await vi.waitFor(
      async () => {
        const { audit, followUps, runs } = await readEffects(company.companyId, leadId);
        expect({ audit: audit.length, followUps: followUps.length, runs: runs.length }).toEqual({
          audit: 1,
          followUps: 1,
          runs: 1,
        });
      },
      { timeout: 5000 },
    );
    expect(dispatched.map((entry) => entry.id)).toEqual(["run-automation"]);
    expect(attempts).toEqual({ attempts: 1, failed: false, value: undefined });
    expect(workflowErrorsIn(errors)).toEqual(["smtp connection refused"]);
  });

  it("refuses to publish a lead under a tenant of another company, and reports it", async () => {
    const mine = await makeCompany({ admin: true });
    const theirs = await makeCompany({ admin: true });
    const sourceId = await makeSource(mine.companyId, null);
    const { leadId } = await processWithoutPublishing(mine.companyId, sourceId);
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const attempts = await runStepLikeTheWorkflowRuntime(publishLeadCreated, leadId, mine.companyId, theirs.adminId);

    expect(attempts).toEqual({ attempts: 1, failed: false, value: undefined });
    expect(await anywhereFor(leadId)).toEqual({ audit: 0, runs: 0 });
    expect((await readEffects(theirs.companyId, leadId)).followUps).toEqual([]);
    expect((await readEffects(mine.companyId, leadId)).followUps).toEqual([]);
    expect(dispatched).toEqual([]);
    expect(workflowErrorsIn(errors)).toEqual([expect.stringMatching(/refused under a tenant of company/)]);
  });

  it("publishes once as the system when the publisher is deactivated between processing and publishing", async () => {
    const company = await makeCompany({ sales: "active" });
    const sourceId = await makeSource(company.companyId, company.salesId);
    const { leadId, publisherUserId } = await processWithoutPublishing(company.companyId, sourceId);
    if (!publisherUserId) throw new Error("the submission named no publisher");
    await runWithoutTenant(() => prisma.user.update({ where: { id: publisherUserId }, data: { status: "inactive" } }));
    const publishes = vi.spyOn(EventService.prototype, "publish");

    const attempts = await runStepLikeTheWorkflowRuntime(
      publishLeadCreated,
      leadId,
      company.companyId,
      publisherUserId,
    );

    expect(attempts).toEqual({ attempts: 1, failed: false, value: undefined });
    expect(publishes.mock.calls.filter(([event]) => event === DomainEvent.LEAD_CREATED)).toEqual([
      [DomainEvent.LEAD_CREATED, expect.objectContaining({ entityId: leadId }), { systemCompanyId: company.companyId }],
    ]);
    const { audit, runs } = await readEffects(company.companyId, leadId);
    expect(audit).toEqual([]);
    expect(runs.map((run) => run.automationId)).toEqual([company.automationId]);
    expect(dispatched.map((entry) => entry.id)).toEqual(["run-automation"]);
  });
});
