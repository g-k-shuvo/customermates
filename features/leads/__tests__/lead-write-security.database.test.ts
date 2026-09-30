import type { ZodError } from "zod";

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
const { interactorFailureKind, serializeInteractorFailure } = await import("@/core/validation/validation.utils");
const { CustomErrorCode } = await import("@/core/validation/validation.types");
const { Action, CustomColumnType, EntityType, LeadStatus, Resource } = await import("@/generated/prisma");
const di = await import("@/core/di");

type ResourceValue = (typeof Resource)[keyof typeof Resource];
type ActionValue = (typeof Action)[keyof typeof Action];
type Grants = Array<[ResourceValue, ActionValue[]]>;
type Outcome = { ok: true; data: unknown } | { ok: false; error: ZodError };

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companyIds: string[] = [];

const OWN_LEADS: Grants = [
  [Resource.leads, [Action.readOwn, Action.create, Action.update, Action.delete]],
  [Resource.users, [Action.readOwn]],
  [Resource.contacts, [Action.readAll]],
  [Resource.organizations, [Action.readAll]],
];

const ALL_LEADS_OWN_RECORDS: Grants = [
  [Resource.leads, [Action.readAll, Action.create, Action.update, Action.delete]],
  [Resource.users, [Action.readOwn]],
  [Resource.contacts, [Action.readOwn]],
  [Resource.organizations, [Action.readOwn]],
  [Resource.deals, [Action.create, Action.readOwn]],
  [Resource.pipelines, [Action.readAll]],
];

async function makeCompany() {
  return runWithoutTenant(async () => {
    const company = await prisma.company.create({ data: {} });
    companyIds.push(company.id);

    return company.id;
  });
}

async function makeUser(companyId: string, name: string, grants: Grants | "admin") {
  return runWithoutTenant(async () => {
    const role = await prisma.userRole.create({
      data: {
        companyId,
        name: `${name} ${randomUUID()}`,
        isSystemRole: grants === "admin",
        ...(grants === "admin"
          ? {}
          : {
              permissions: {
                create: grants.flatMap(([resource, actions]) =>
                  actions.map((action) => ({ companyId, resource, action })),
                ),
              },
            }),
      },
      select: { id: true },
    });
    const user = await prisma.user.create({
      data: {
        companyId,
        roleId: role.id,
        email: `${name.toLowerCase()}-${randomUUID()}@example.invalid`,
        firstName: name,
        lastName: "Tester",
        status: "active",
      },
      select: { id: true },
    });

    return user.id;
  });
}

async function makeRelations(companyId: string, label: string) {
  return runWithoutTenant(async () => {
    const contact = await prisma.contact.create({
      data: { companyId, firstName: label, lastName: "Contact" },
      select: { id: true },
    });
    const organization = await prisma.organization.create({
      data: { companyId, name: `${label} Org` },
      select: { id: true },
    });
    const source = await prisma.webFormSource.create({
      data: {
        companyId,
        name: `${label} form`,
        slug: `form-${randomUUID()}`,
        signingSecret: "s".repeat(64),
        fieldMapping: {},
      },
      select: { id: true },
    });

    return { contactId: contact.id, organizationId: organization.id, sourceId: source.id };
  });
}

async function makePipeline(
  companyId: string,
  name: string,
  options: { isDefault?: boolean; archived?: boolean } = {},
) {
  return runWithoutTenant(async () => {
    const pipeline = await prisma.pipeline.create({
      data: {
        companyId,
        name,
        isDefault: options.isDefault ?? false,
        archivedAt: options.archived ? new Date() : null,
        stages: { create: [{ companyId, name: `${name} first stage`, position: 0 }] },
      },
      select: { id: true, stages: { select: { id: true } } },
    });

    return { pipelineId: pipeline.id, stageId: pipeline.stages[0].id };
  });
}

async function makeLead(companyId: string, data: Record<string, unknown> = {}) {
  return runWithoutTenant(async () => {
    const lead = await prisma.lead.create({
      data: { companyId, title: `Lead ${randomUUID()}`, ...data },
      select: { id: true },
    });

    return lead.id;
  });
}

function readLead(id: string) {
  return runWithoutTenant(() => prisma.lead.findUnique({ where: { id }, include: { customFieldValues: true } }));
}

function auditCount(entityId: string, event: string) {
  return runWithoutTenant(() => prisma.auditLog.count({ where: { entityId, event } }));
}

function failure(outcome: Outcome) {
  expect(outcome.ok).toBe(false);
  if (outcome.ok) throw new Error("expected the write to be refused");

  return {
    kind: interactorFailureKind(outcome.error),
    issues: serializeInteractorFailure(outcome.error).issues.map(({ path, customCode }) => ({ path, customCode })),
  };
}

describeDatabase("lead writes stay inside the caller's reach", () => {
  let mine: string;
  let theirs: string;
  let admin: string;
  let rep: string;
  let colleague: string;
  let reviewer: string;
  let own: Awaited<ReturnType<typeof makeRelations>>;
  let foreign: Awaited<ReturnType<typeof makeRelations>>;
  let foreignUser: string;
  let defaultPipeline: Awaited<ReturnType<typeof makePipeline>>;
  let deliveryPipeline: Awaited<ReturnType<typeof makePipeline>>;
  let archivedPipeline: Awaited<ReturnType<typeof makePipeline>>;
  let foreignPipeline: Awaited<ReturnType<typeof makePipeline>>;
  let leadDateColumn: string;
  let dealColumn: string;

  beforeAll(async () => {
    mine = await makeCompany();
    theirs = await makeCompany();
    admin = await makeUser(mine, "Admin", "admin");
    rep = await makeUser(mine, "Rep", OWN_LEADS);
    colleague = await makeUser(mine, "Colleague", OWN_LEADS);
    reviewer = await makeUser(mine, "Reviewer", ALL_LEADS_OWN_RECORDS);
    foreignUser = await makeUser(theirs, "Stranger", "admin");
    own = await makeRelations(mine, "Mine");
    foreign = await makeRelations(theirs, "Theirs");
    defaultPipeline = await makePipeline(mine, "Sales", { isDefault: true });
    deliveryPipeline = await makePipeline(mine, "Delivery");
    archivedPipeline = await makePipeline(mine, "Retired", { archived: true });
    foreignPipeline = await makePipeline(theirs, "Their sales", { isDefault: true });

    const columns = await runWithoutTenant(() =>
      Promise.all([
        prisma.customColumn.create({
          data: { companyId: mine, label: "Follow-up date", type: CustomColumnType.date, entityType: EntityType.lead },
          select: { id: true },
        }),
        prisma.customColumn.create({
          data: { companyId: mine, label: "Deal code", type: CustomColumnType.plain, entityType: EntityType.deal },
          select: { id: true },
        }),
      ]),
    );
    leadDateColumn = columns[0].id;
    dealColumn = columns[1].id;
  });

  afterAll(async () => {
    await runWithoutTenant(async () => {
      for (const companyId of companyIds) await prisma.company.delete({ where: { id: companyId } });
    });
    await prisma.$disconnect();
  });

  it("refuses a create that names another company's contact, organization, owner or source, and stores nothing", async () => {
    const title = `Foreign ids ${randomUUID()}`;

    const outcome = await runAsBackgroundTenant(admin, () =>
      di.getCreateLeadInteractor().invoke({
        title,
        contactId: foreign.contactId,
        organizationId: foreign.organizationId,
        ownerUserId: foreignUser,
        sourceId: foreign.sourceId,
      } as never),
    );

    const refused = failure(outcome);
    expect(refused.issues).toEqual(
      expect.arrayContaining([
        { path: ["contactId"], customCode: CustomErrorCode.contactNotFound },
        { path: ["organizationId"], customCode: CustomErrorCode.organizationNotFound },
        { path: ["ownerUserId"], customCode: CustomErrorCode.userNotFound },
        { path: ["sourceId"], customCode: CustomErrorCode.webFormSourceNotFound },
      ]),
    );
    expect(refused.issues).toHaveLength(4);
    expect(await runWithoutTenant(() => prisma.lead.count({ where: { title } }))).toBe(0);
  });

  it("refuses an update that points a lead at another company's records and leaves it untouched", async () => {
    const leadId = await makeLead(mine, { contactId: own.contactId, ownerUserId: admin });

    const outcome = await runAsBackgroundTenant(admin, () =>
      di.getUpdateLeadInteractor().invoke({
        id: leadId,
        contactId: foreign.contactId,
        sourceId: foreign.sourceId,
        ownerUserId: foreignUser,
      } as never),
    );

    expect(failure(outcome).issues).toEqual(
      expect.arrayContaining([
        { path: ["contactId"], customCode: CustomErrorCode.contactNotFound },
        { path: ["sourceId"], customCode: CustomErrorCode.webFormSourceNotFound },
        { path: ["ownerUserId"], customCode: CustomErrorCode.userNotFound },
      ]),
    );
    expect(await readLead(leadId)).toMatchObject({ contactId: own.contactId, ownerUserId: admin, sourceId: null });
  });

  it("answers not found when a caller limited to their own leads updates or deletes a colleague's lead", async () => {
    const leadId = await makeLead(mine, { ownerUserId: colleague, title: "Colleague's lead" });

    const updated = await runAsBackgroundTenant(rep, () =>
      di.getUpdateLeadInteractor().invoke({ id: leadId } as never),
    );
    const renamed = await runAsBackgroundTenant(rep, () =>
      di.getUpdateLeadInteractor().invoke({ id: leadId, title: "Taken over" } as never),
    );
    const deleted = await runAsBackgroundTenant(rep, () => di.getDeleteLeadInteractor().invoke({ id: leadId }));

    for (const outcome of [updated, renamed, deleted]) {
      const refused = failure(outcome);
      expect(refused.kind).toBe("not_found");
      expect(refused.issues).toEqual([{ path: ["id"], customCode: CustomErrorCode.leadNotFound }]);
    }
    expect(await readLead(leadId)).toMatchObject({ title: "Colleague's lead", ownerUserId: colleague });
    expect(await auditCount(leadId, "lead.updated")).toBe(0);
    expect(await auditCount(leadId, "lead.deleted")).toBe(0);
  });

  it("keeps the repository from changing or deleting a lead outside the caller's scope, even without a precheck", async () => {
    const leadId = await makeLead(mine, { ownerUserId: colleague, title: "Out of reach" });

    await expect(
      runAsBackgroundTenant(rep, () =>
        di.getLeadRepo().updateLeadOrThrow({ id: leadId, title: "Taken over" } as never),
      ),
    ).rejects.toThrow();
    await expect(runAsBackgroundTenant(rep, () => di.getLeadRepo().deleteLeadOrThrow(leadId))).rejects.toThrow();
    expect(await readLead(leadId)).toMatchObject({ title: "Out of reach", ownerUserId: colleague });
  });

  it("still lets a caller update and delete their own lead", async () => {
    const leadId = await makeLead(mine, { ownerUserId: rep, title: "Mine to change" });

    const renamed = await runAsBackgroundTenant(rep, () =>
      di.getUpdateLeadInteractor().invoke({ id: leadId, title: "Changed by me" } as never),
    );
    const deleted = await runAsBackgroundTenant(rep, () => di.getDeleteLeadInteractor().invoke({ id: leadId }));

    expect(renamed).toMatchObject({ ok: true, data: { title: "Changed by me" } });
    expect(deleted).toEqual({ ok: true, data: leadId });
    expect(await readLead(leadId)).toBeNull();
    expect(await auditCount(leadId, "lead.updated")).toBe(1);
    expect(await auditCount(leadId, "lead.deleted")).toBe(1);
  });

  it("keeps a caller limited to their own leads from handing a lead to someone else or leaving it unowned", async () => {
    const leadId = await makeLead(mine, { ownerUserId: rep });

    const handedOver = await runAsBackgroundTenant(rep, () =>
      di.getUpdateLeadInteractor().invoke({ id: leadId, ownerUserId: null } as never),
    );
    const createdUnowned = await runAsBackgroundTenant(rep, () =>
      di.getCreateLeadInteractor().invoke({ title: `Unowned ${randomUUID()}` } as never),
    );

    expect(failure(handedOver).issues).toEqual([
      { path: ["ownerUserId"], customCode: CustomErrorCode.assigneeRequired },
    ]);
    expect(failure(createdUnowned).issues).toEqual([
      { path: ["ownerUserId"], customCode: CustomErrorCode.assigneeRequired },
    ]);
    expect(await readLead(leadId)).toMatchObject({ ownerUserId: rep });
  });

  it("changes only the fields a partial update names", async () => {
    const leadId = await makeLead(mine, {
      status: LeadStatus.qualified,
      sourceOrigin: "webform",
      labels: ["hot", "footer"],
      value: 500,
      contactId: own.contactId,
      organizationId: own.organizationId,
      ownerUserId: admin,
      sourceId: own.sourceId,
      notes: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Keep me" }] }] },
    });
    await runWithoutTenant(() =>
      prisma.customFieldValue.create({
        data: {
          companyId: mine,
          entityType: EntityType.lead,
          type: CustomColumnType.date,
          columnId: leadDateColumn,
          leadId,
          value: "2026-10-01",
        },
      }),
    );
    const before = await readLead(leadId);

    const single = await runAsBackgroundTenant(admin, () =>
      di.getUpdateLeadInteractor().invoke({ id: leadId, title: "Renamed once" } as never),
    );
    const many = await runAsBackgroundTenant(admin, () =>
      di.getUpdateManyLeadsInteractor().invoke({ leads: [{ id: leadId, title: "Renamed twice" }] } as never),
    );

    expect(single.ok).toBe(true);
    expect(many.ok).toBe(true);
    const after = await readLead(leadId);
    expect(after).toMatchObject({
      title: "Renamed twice",
      status: LeadStatus.qualified,
      sourceOrigin: "webform",
      labels: ["hot", "footer"],
      value: 500,
      contactId: own.contactId,
      organizationId: own.organizationId,
      ownerUserId: admin,
      sourceId: own.sourceId,
      notes: before?.notes,
    });
    expect(after?.customFieldValues.map(({ columnId, value }) => ({ columnId, value }))).toEqual([
      { columnId: leadDateColumn, value: "2026-10-01" },
    ]);
  });

  it("clears a relation, the value and the notes when they are sent as null", async () => {
    const leadId = await makeLead(mine, {
      contactId: own.contactId,
      organizationId: own.organizationId,
      value: 120,
      notes: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Old note" }] }] },
    });

    const outcome = await runAsBackgroundTenant(admin, () =>
      di.getUpdateLeadInteractor().invoke({ id: leadId, contactId: null, value: null, notes: null } as never),
    );

    expect(outcome).toMatchObject({ ok: true, data: { contact: null, value: null, notes: null } });
    expect(await readLead(leadId)).toMatchObject({
      contactId: null,
      value: null,
      notes: null,
      organizationId: own.organizationId,
    });
  });

  it("accepts a save that resends relations the caller cannot see, as the lead page does", async () => {
    const leadId = await makeLead(mine, { ownerUserId: colleague, contactId: own.contactId, title: "Shared lead" });

    const saved = await runAsBackgroundTenant(reviewer, () =>
      di.getUpdateLeadInteractor().invoke({
        id: leadId,
        title: "Reviewed",
        ownerUserId: colleague,
        contactId: own.contactId,
      } as never),
    );
    const reassigned = await runAsBackgroundTenant(reviewer, () =>
      di.getUpdateLeadInteractor().invoke({ id: leadId, ownerUserId: admin } as never),
    );

    expect(saved).toMatchObject({ ok: true, data: { title: "Reviewed" } });
    expect(failure(reassigned).issues).toEqual([{ path: ["ownerUserId"], customCode: CustomErrorCode.userNotFound }]);
    expect(await readLead(leadId)).toMatchObject({
      title: "Reviewed",
      ownerUserId: colleague,
      contactId: own.contactId,
    });
  });

  it("accepts only this company's lead columns, with values valid for the column", async () => {
    const title = `Custom fields ${randomUUID()}`;

    const outcome = await runAsBackgroundTenant(admin, () =>
      di.getCreateLeadInteractor().invoke({
        title,
        customFieldValues: [
          { columnId: dealColumn, value: "D-1" },
          { columnId: leadDateColumn, value: "next tuesday" },
        ],
      } as never),
    );

    expect(failure(outcome).issues).toEqual([
      { path: ["customFieldValues", 0, "columnId"], customCode: CustomErrorCode.customColumnNotFound },
      { path: ["customFieldValues", 1, "value"], customCode: CustomErrorCode.customFieldInvalidDate },
    ]);
    expect(await runWithoutTenant(() => prisma.lead.count({ where: { title } }))).toBe(0);
  });

  it("refuses a conversion into a foreign, archived or mismatched placement, and converts nothing", async () => {
    const title = `Misplaced ${randomUUID()}`;
    const leadId = await makeLead(mine, { ownerUserId: admin, title });
    const convert = (placement: Record<string, string>) =>
      runAsBackgroundTenant(admin, () => di.getConvertLeadToDealInteractor().invoke({ id: leadId, ...placement }));

    const cases = [
      [
        { pipelineId: foreignPipeline.pipelineId },
        { path: ["pipelineId"], customCode: CustomErrorCode.pipelineNotFound },
      ],
      [{ stageId: foreignPipeline.stageId }, { path: ["stageId"], customCode: CustomErrorCode.pipelineStageNotFound }],
      [
        { pipelineId: archivedPipeline.pipelineId },
        { path: ["pipelineId"], customCode: CustomErrorCode.pipelineArchived },
      ],
      [{ stageId: archivedPipeline.stageId }, { path: ["stageId"], customCode: CustomErrorCode.pipelineArchived }],
      [
        { pipelineId: defaultPipeline.pipelineId, stageId: deliveryPipeline.stageId },
        { path: ["stageId"], customCode: CustomErrorCode.pipelineStageMismatch },
      ],
    ] as const;

    for (const [placement, issue] of cases) expect(failure(await convert(placement)).issues).toEqual([issue]);

    expect(await readLead(leadId)).toMatchObject({ convertedDealId: null, status: LeadStatus.new });
    expect(await runWithoutTenant(() => prisma.deal.count({ where: { companyId: mine, name: title } }))).toBe(0);
  });

  it("converts into a placement of this company", async () => {
    const leadId = await makeLead(mine, { ownerUserId: admin, title: "Ready to buy" });

    const outcome = await runAsBackgroundTenant(admin, () =>
      di
        .getConvertLeadToDealInteractor()
        .invoke({ id: leadId, pipelineId: deliveryPipeline.pipelineId, stageId: deliveryPipeline.stageId }),
    );

    expect(outcome.ok).toBe(true);
    const lead = await readLead(leadId);
    const deal = await runWithoutTenant(() =>
      prisma.deal.findUnique({ where: { id: lead?.convertedDealId ?? "" }, include: { users: true } }),
    );
    expect(deal).toMatchObject({
      name: "Ready to buy",
      pipelineId: deliveryPipeline.pipelineId,
      stageId: deliveryPipeline.stageId,
    });
    expect(deal?.users.map(({ userId }) => userId)).toEqual([admin]);
  });

  it("holds a converted deal to the deal assignee guard for the owner it inherits from the lead", async () => {
    const colleaguesLead = await makeLead(mine, { ownerUserId: colleague });
    const reviewersLead = await makeLead(mine, { ownerUserId: reviewer });

    const refused = await runAsBackgroundTenant(reviewer, () =>
      di.getConvertLeadToDealInteractor().invoke({ id: colleaguesLead }),
    );
    const converted = await runAsBackgroundTenant(reviewer, () =>
      di.getConvertLeadToDealInteractor().invoke({ id: reviewersLead }),
    );

    expect(failure(refused).issues).toEqual([{ path: ["ownerUserId"], customCode: CustomErrorCode.assigneeRequired }]);
    expect(await readLead(colleaguesLead)).toMatchObject({ convertedDealId: null });
    expect(converted.ok).toBe(true);
    expect((await readLead(reviewersLead))?.convertedDealId).toEqual(expect.any(String));
  });

  it("links the converted deal back to the lead it came from", async () => {
    const title = `Origin ${randomUUID()}`;
    const leadId = await makeLead(mine, { ownerUserId: admin, title });

    const converted = await runAsBackgroundTenant(admin, () =>
      di.getConvertLeadToDealInteractor().invoke({ id: leadId }),
    );
    if (!converted.ok) throw new Error("convert failed");
    const dealId = (await readLead(leadId))?.convertedDealId ?? "";

    const read = await runAsBackgroundTenant(admin, () => di.getGetDealByIdInteractor().invoke({ id: dealId }));

    expect(read).toMatchObject({ ok: true, data: { deal: { sourceLead: { id: leadId, title } } } });
  });

  it("carries markdown notes over as a document, and refuses notes no editor can read", async () => {
    const markdownLead = await makeLead(mine, { ownerUserId: admin, notes: "Called twice, **very** keen" });
    const brokenLead = await makeLead(mine, { ownerUserId: admin, notes: { message: "Legacy web form text" } });

    const carried = await runAsBackgroundTenant(admin, () =>
      di.getConvertLeadToDealInteractor().invoke({ id: markdownLead }),
    );
    const refused = await runAsBackgroundTenant(admin, () =>
      di.getConvertLeadToDealInteractor().invoke({ id: brokenLead }),
    );

    expect(carried.ok).toBe(true);
    const deal = await runWithoutTenant(async () =>
      prisma.deal.findUnique({ where: { id: (await readLead(markdownLead))?.convertedDealId ?? "" } }),
    );
    expect(deal?.notes).toMatchObject({ type: "doc" });
    expect(JSON.stringify(deal?.notes)).toContain("very");
    expect(failure(refused).issues).toEqual([{ path: ["notes"], customCode: CustomErrorCode.notesInvalidFormat }]);
    expect(await readLead(brokenLead)).toMatchObject({ convertedDealId: null });
  });
});
