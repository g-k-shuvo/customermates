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
    EMAIL_TRANSPORT: "console",
  },
}));

const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runAsBackgroundTenant } = await import("@/core/decorators/background-tenant");
const { Action, EntityType, Resource } = await import("@/generated/prisma");
const di = await import("@/core/di");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

const HIGHER_ED = "3c1f7a52-8a5e-4d0b-9c2e-5f6a7b8c9d01";
const RETAIL = "3c1f7a52-8a5e-4d0b-9c2e-5f6a7b8c9d02";

describeDatabase("the audience resolver", () => {
  const companyId = randomUUID();
  let adminId: string;
  let ownerOnlyId: string;
  let targetsId: string;
  let excludedId: string;
  let industryId: string;
  let roleColumnId: string;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: companyId } });
      const admin = await prisma.userRole.create({
        data: { companyId, name: `Admin ${randomUUID()}`, isSystemRole: true },
        select: { id: true },
      });
      const limited = await prisma.userRole.create({
        data: {
          companyId,
          name: `Own ${randomUUID()}`,
          isSystemRole: false,
          permissions: { create: [{ companyId, resource: Resource.contacts, action: Action.readOwn }] },
        },
        select: { id: true },
      });
      const user = async (roleId: string) =>
        (
          await prisma.user.create({
            data: {
              companyId,
              roleId,
              email: `u-${randomUUID()}@example.invalid`,
              firstName: "U",
              lastName: "Ser",
              status: "active",
            },
            select: { id: true },
          })
        ).id;
      adminId = await user(admin.id);
      ownerOnlyId = await user(limited.id);

      industryId = (
        await prisma.customColumn.create({
          data: {
            companyId,
            label: "Industry",
            type: "singleSelect",
            entityType: EntityType.organization,
            options: {
              options: [
                { value: HIGHER_ED, label: "Higher Education", color: "default", isDefault: false, index: 0 },
                { value: RETAIL, label: "Retail", color: "default", isDefault: false, index: 1 },
              ],
            },
          },
          select: { id: true },
        })
      ).id;
      roleColumnId = (
        await prisma.customColumn.create({
          data: { companyId, label: "Role", type: "plain", entityType: EntityType.contact },
          select: { id: true },
        })
      ).id;
      const organization = async (name: string, industry: string) =>
        (
          await prisma.organization.create({
            data: {
              companyId,
              name,
              customFieldValues: {
                create: {
                  companyId,
                  entityType: EntityType.organization,
                  columnId: industryId,
                  value: industry,
                  type: "singleSelect",
                },
              },
            },
            select: { id: true },
          })
        ).id;
      const university = await organization("University", HIGHER_ED);
      const shop = await organization("Shop", RETAIL);

      targetsId = (await prisma.contactList.create({ data: { companyId, name: "CDI Targets" }, select: { id: true } }))
        .id;
      excludedId = (await prisma.contactList.create({ data: { companyId, name: "Opted out" }, select: { id: true } }))
        .id;

      const contact = async (
        key: string,
        options: { organizationId: string; email: boolean; lists: string[]; role?: string; ownedBy?: string },
      ) => {
        const created = await prisma.contact.create({
          data: {
            companyId,
            firstName: key,
            lastName: "Test",
            organizations: { create: { companyId, organizationId: options.organizationId } },
            identifiers: options.email
              ? {
                  create: {
                    companyId,
                    provider: "mail",
                    channelClass: "email",
                    value: `${key.toLowerCase()}@audience.example`,
                  },
                }
              : undefined,
            customFieldValues: options.role
              ? {
                  create: {
                    companyId,
                    entityType: EntityType.contact,
                    columnId: roleColumnId,
                    value: options.role,
                    type: "plain",
                  },
                }
              : undefined,
            users: options.ownedBy ? { create: { companyId, userId: options.ownedBy } } : undefined,
          },
          select: { id: true },
        });
        for (const listId of options.lists)
          await prisma.contactListMember.create({ data: { companyId, listId, contactId: created.id } });
        ids[key] = created.id;
      };

      await contact("Ada", {
        organizationId: university,
        email: true,
        lists: [targetsId],
        role: "Dean",
        ownedBy: ownerOnlyId,
      });
      await contact("Ben", { organizationId: shop, email: true, lists: [targetsId] });
      await contact("Cleo", { organizationId: university, email: false, lists: [targetsId] });
      await contact("Dan", { organizationId: university, email: true, lists: [] });
      await contact("Eve", { organizationId: university, email: true, lists: [targetsId, excludedId], role: "Dean" });
    });
  });

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: companyId } }));
    await prisma.$disconnect();
  });

  const preview = (userId: string, conditions: unknown[]) =>
    runAsBackgroundTenant(userId, () => di.getPreviewAudienceInteractor().invoke({ conditions } as never));

  const cdiTargets = () => [
    { kind: "onList", listId: targetsId },
    { kind: "organizationField", columnId: industryId, values: [HIGHER_ED] },
  ];

  it("selects list members at a Higher Education organization, and counts those without an email apart", async () => {
    const outcome = await preview(adminId, cdiTargets());

    expect(outcome.ok && outcome.data.count).toBe(2);
    expect(outcome.ok && outcome.data.withoutEmail).toBe(1);
    expect(outcome.ok && outcome.data.sample.map((row) => row.firstName).sort()).toEqual(["Ada", "Eve"]);
    expect(outcome.ok && outcome.data.sample.find((row) => row.firstName === "Ada")).toMatchObject({
      email: "ada@audience.example",
      organizationName: "University",
    });
  });

  it("excludes a list and matches a contact field", async () => {
    const excluded = await preview(adminId, [...cdiTargets(), { kind: "notOnList", listId: excludedId }]);
    expect(excluded.ok && excluded.data.sample.map((row) => row.firstName)).toEqual(["Ada"]);

    const deans = await preview(adminId, [{ kind: "contactField", columnId: roleColumnId, values: ["Dean"] }]);
    expect(deans.ok && deans.data.sample.map((row) => row.firstName).sort()).toEqual(["Ada", "Eve"]);
  });

  it("matches an any-of group as OR and a none-of group as NOT", async () => {
    const anyOf = await preview(adminId, [
      { kind: "onList", listId: targetsId },
      {
        kind: "anyOf",
        conditions: [
          { kind: "organizationField", columnId: industryId, values: [RETAIL] },
          { kind: "contactField", columnId: roleColumnId, values: ["Dean"] },
        ],
      },
    ]);
    expect(anyOf.ok && anyOf.data.sample.map((row) => row.firstName).sort()).toEqual(["Ada", "Ben", "Eve"]);

    const noneOf = await preview(adminId, [
      { kind: "onList", listId: targetsId },
      {
        kind: "noneOf",
        conditions: [
          { kind: "onList", listId: excludedId },
          { kind: "organizationField", columnId: industryId, values: [RETAIL] },
        ],
      },
    ]);
    expect(noneOf.ok && noneOf.data).toMatchObject({ count: 1, withoutEmail: 1 });
    expect(noneOf.ok && noneOf.data.sample.map((row) => row.firstName)).toEqual(["Ada"]);
  });

  it("checks references inside groups and refuses nested groups", async () => {
    expect(
      (await preview(adminId, [{ kind: "anyOf", conditions: [{ kind: "onList", listId: randomUUID() }] }])).ok,
    ).toBe(false);
    expect(
      (
        await preview(adminId, [
          { kind: "anyOf", conditions: [{ kind: "noneOf", conditions: [{ kind: "onList", listId: targetsId }] }] },
        ])
      ).ok,
    ).toBe(false);
  });

  it("lets a read-own user preview only their own contacts", async () => {
    const outcome = await preview(ownerOnlyId, cdiTargets());

    expect(outcome.ok && outcome.data).toMatchObject({ count: 1, withoutEmail: 0 });
    expect(outcome.ok && outcome.data.sample.map((row) => row.contactId)).toEqual([ids.Ada]);
  });

  it("refuses a list or field that does not exist, and a field of the wrong record type", async () => {
    expect((await preview(adminId, [{ kind: "onList", listId: randomUUID() }])).ok).toBe(false);
    expect((await preview(adminId, [{ kind: "contactField", columnId: industryId, values: [HIGHER_ED] }])).ok).toBe(
      false,
    );
    expect((await preview(adminId, [])).ok).toBe(false);
  });
});
