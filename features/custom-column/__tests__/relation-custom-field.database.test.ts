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
const { serializeInteractorFailure } = await import("@/core/validation/validation.utils");
const { CustomErrorCode } = await import("@/core/validation/validation.types");
const { FilterOperatorKey } = await import("@/core/base/base-query-builder");
const { Action, CustomColumnType, EntityType, Resource } = await import("@/generated/prisma");
const di = await import("@/core/di");

type Outcome = { ok: true; data: unknown } | { ok: false; error: ZodError };

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

function issueCodes(outcome: Outcome) {
  expect(outcome.ok).toBe(false);
  if (outcome.ok) throw new Error("expected the write to be refused");

  return serializeInteractorFailure(outcome.error).issues.map(({ path, customCode }) => ({ path, customCode }));
}

describeDatabase("relation custom fields", () => {
  const companyId = randomUUID();
  const otherCompanyId = randomUUID();
  let admin: string;
  let rep: string;
  let referralColumn: string;
  let accountColumn: string;
  let referrer: string;
  let privateContact: string;
  let foreignContact: string;
  let account: string;

  beforeAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.createMany({ data: [{ id: companyId }, { id: otherCompanyId }] });

      const adminRole = await prisma.userRole.create({
        data: { companyId, name: `Admin ${randomUUID()}`, isSystemRole: true },
        select: { id: true },
      });
      const repRole = await prisma.userRole.create({
        data: {
          companyId,
          name: `Rep ${randomUUID()}`,
          permissions: {
            create: [
              { companyId, resource: Resource.deals, action: Action.readAll },
              { companyId, resource: Resource.deals, action: Action.update },
              { companyId, resource: Resource.contacts, action: Action.readOwn },
            ],
          },
        },
        select: { id: true },
      });
      const makeUser = (roleId: string, name: string) =>
        prisma.user
          .create({
            data: {
              companyId,
              roleId,
              email: `${name}-${randomUUID()}@example.invalid`,
              firstName: name,
              lastName: "Tester",
              status: "active",
            },
            select: { id: true },
          })
          .then((user) => user.id);
      admin = await makeUser(adminRole.id, "admin");
      rep = await makeUser(repRole.id, "rep");

      referrer = (
        await prisma.contact.create({
          data: { companyId, firstName: "Rita", lastName: "Referrer", users: { create: { userId: rep, companyId } } },
          select: { id: true },
        })
      ).id;
      privateContact = (
        await prisma.contact.create({
          data: { companyId, firstName: "Paul", lastName: "Private" },
          select: { id: true },
        })
      ).id;
      foreignContact = (
        await prisma.contact.create({
          data: { companyId: otherCompanyId, firstName: "Frank", lastName: "Foreign" },
          select: { id: true },
        })
      ).id;
      account = (await prisma.organization.create({ data: { companyId, name: "Acme GmbH" }, select: { id: true } })).id;

      referralColumn = (
        await prisma.customColumn.create({
          data: {
            companyId,
            label: "Referral contact",
            type: CustomColumnType.relation,
            entityType: EntityType.deal,
            options: { targetEntityType: EntityType.contact },
          },
          select: { id: true },
        })
      ).id;
      accountColumn = (
        await prisma.customColumn.create({
          data: {
            companyId,
            label: "Opportunity company",
            type: CustomColumnType.relation,
            entityType: EntityType.deal,
            options: { targetEntityType: EntityType.organization },
          },
          select: { id: true },
        })
      ).id;
    });
  });

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } }));
    await prisma.$disconnect();
  });

  const makeDeal = () =>
    runWithoutTenant(() =>
      prisma.deal.create({ data: { companyId, name: `Deal ${randomUUID()}` }, select: { id: true } }),
    ).then((deal) => deal.id);

  const storedValues = (dealId: string) =>
    runWithoutTenant(() =>
      prisma.customFieldValue.findMany({
        where: { dealId },
        select: { columnId: true, value: true, targetContactId: true, targetOrganizationId: true },
      }),
    );

  it("stores the target in a typed foreign key and drops the link when the target is deleted", async () => {
    const dealId = await makeDeal();
    const organization = await runWithoutTenant(() =>
      prisma.organization.create({ data: { companyId, name: "Short-lived" }, select: { id: true } }),
    );

    const outcome = await runAsBackgroundTenant(admin, () =>
      di.getUpdateDealInteractor().invoke({
        id: dealId,
        customFieldValues: [
          { columnId: referralColumn, value: referrer },
          { columnId: accountColumn, value: organization.id },
        ],
      }),
    );
    expect(outcome.ok).toBe(true);

    expect(await storedValues(dealId)).toEqual(
      expect.arrayContaining([
        { columnId: referralColumn, value: referrer, targetContactId: referrer, targetOrganizationId: null },
        {
          columnId: accountColumn,
          value: organization.id,
          targetContactId: null,
          targetOrganizationId: organization.id,
        },
      ]),
    );

    await runWithoutTenant(() => prisma.organization.delete({ where: { id: organization.id } }));

    expect(await storedValues(dealId)).toEqual([
      { columnId: referralColumn, value: referrer, targetContactId: referrer, targetOrganizationId: null },
    ]);
  });

  it("refuses a target the caller cannot see, one from another company, and one of the wrong kind", async () => {
    const dealId = await makeDeal();

    const outcome = (await runAsBackgroundTenant(rep, () =>
      di.getUpdateDealInteractor().invoke({
        id: dealId,
        customFieldValues: [
          { columnId: referralColumn, value: privateContact },
          { columnId: referralColumn, value: foreignContact },
          { columnId: accountColumn, value: referrer },
        ],
      }),
    )) as Outcome;

    expect(issueCodes(outcome)).toEqual(
      expect.arrayContaining([
        { path: ["customFieldValues", 0, "value"], customCode: CustomErrorCode.contactNotFound },
        { path: ["customFieldValues", 1, "value"], customCode: CustomErrorCode.contactNotFound },
        { path: ["customFieldValues", 2, "value"], customCode: CustomErrorCode.organizationNotFound },
      ]),
    );
    expect(await storedValues(dealId)).toEqual([]);

    const allowed = await runAsBackgroundTenant(rep, () =>
      di.getUpdateDealInteractor().invoke({
        id: dealId,
        customFieldValues: [{ columnId: referralColumn, value: referrer }],
      }),
    );
    expect(allowed.ok).toBe(true);
  });

  it("labels only the targets the caller can see", async () => {
    const outcome = await runAsBackgroundTenant(rep, () =>
      di.getGetRelationTargetLabelsInteractor().invoke({
        targetEntityType: EntityType.contact,
        ids: [referrer, privateContact, foreignContact],
      }),
    );

    expect(outcome).toEqual({ ok: true, data: [{ id: referrer, label: "Rita Referrer" }] });
  });

  it("filters records by their linked target", async () => {
    const linked = await makeDeal();
    const unlinked = await makeDeal();
    await runAsBackgroundTenant(admin, () =>
      di.getUpdateDealInteractor().invoke({
        id: linked,
        customFieldValues: [{ columnId: accountColumn, value: account }],
      }),
    );

    const byTarget = await runAsBackgroundTenant(admin, () =>
      di.getGetDealsInteractor().invoke({
        filters: [{ field: accountColumn, operator: FilterOperatorKey.in, value: [account] }],
      }),
    );
    const withoutTarget = await runAsBackgroundTenant(admin, () =>
      di.getGetDealsInteractor().invoke({
        filters: [{ field: accountColumn, operator: FilterOperatorKey.isNull }],
      }),
    );

    const ids = (result: typeof byTarget) => (result.ok ? result.data.items.map((deal) => deal.id) : []);
    expect(ids(byTarget)).toEqual([linked]);
    expect(ids(withoutTarget)).toContain(unlinked);
    expect(ids(withoutTarget)).not.toContain(linked);
  });

  it("groups records by their linked target, and a viewer who cannot see the target gets no group for it", async () => {
    const first = await makeDeal();
    const second = await makeDeal();
    for (const id of [first, second]) {
      await runAsBackgroundTenant(admin, () =>
        di.getUpdateDealInteractor().invoke({ id, customFieldValues: [{ columnId: accountColumn, value: account }] }),
      );
    }

    type Grouped = { grouping?: { groups: Array<{ key: string; label?: string; count: number; isNoValue: boolean }> } };
    const groupsFor = async (userId: string) => {
      const result = await runAsBackgroundTenant(userId, () =>
        di.getGetDealsInteractor().invoke({ grouping: { field: accountColumn } }),
      );
      return result.ok ? ((result.data as Grouped).grouping?.groups ?? []) : [];
    };

    const adminGroups = await groupsFor(admin);
    expect(adminGroups.find((group) => group.key === account)).toMatchObject({ label: "Acme GmbH" });
    expect(adminGroups.find((group) => group.key === account)?.count).toBeGreaterThanOrEqual(2);
    expect(adminGroups.some((group) => group.isNoValue)).toBe(true);

    const repGroups = await groupsFor(rep);
    expect(repGroups.map((group) => group.key)).not.toContain(account);
  });

  it("keeps a relation column's kind and target fixed once created", async () => {
    const retarget = (await runAsBackgroundTenant(admin, () =>
      di.getUpsertCustomColumnInteractor().invoke({
        id: referralColumn,
        label: "Referral contact",
        entityType: EntityType.deal,
        type: CustomColumnType.relation,
        options: { targetEntityType: EntityType.deal },
      }),
    )) as Outcome;
    const retype = (await runAsBackgroundTenant(admin, () =>
      di.getUpsertCustomColumnInteractor().invoke({
        id: referralColumn,
        label: "Referral contact",
        entityType: EntityType.deal,
        type: CustomColumnType.plain,
      }),
    )) as Outcome;

    expect(issueCodes(retarget)).toEqual([
      { path: ["type"], customCode: CustomErrorCode.customColumnRelationImmutable },
    ]);
    expect(issueCodes(retype)).toEqual([{ path: ["type"], customCode: CustomErrorCode.customColumnRelationImmutable }]);

    const renamed = await runAsBackgroundTenant(admin, () =>
      di.getUpsertCustomColumnInteractor().invoke({
        id: referralColumn,
        label: "Referred by",
        entityType: EntityType.deal,
        type: CustomColumnType.relation,
        options: { targetEntityType: EntityType.contact },
      }),
    );
    expect(renamed.ok).toBe(true);
  });
});
