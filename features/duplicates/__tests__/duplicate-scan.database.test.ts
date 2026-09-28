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
const { Action, DuplicateMatchKeyKind, EntityType, Resource } = await import("@/generated/prisma");
const di = await import("@/core/di");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("duplicate scan", () => {
  const companyId = randomUUID();
  const otherCompanyId = randomUUID();
  let admin: string;
  let rep: string;
  const contact: Record<string, string> = {};

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
          permissions: { create: [{ companyId, resource: Resource.contacts, action: Action.readOwn }] },
        },
        select: { id: true },
      });
      const makeUser = async (roleId: string, name: string) =>
        (
          await prisma.user.create({
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
        ).id;
      admin = await makeUser(adminRole.id, "admin");
      rep = await makeUser(repRole.id, "rep");

      const organization = await prisma.organization.create({
        data: { companyId, name: "Acme" },
        select: { id: true },
      });
      const make = async (
        key: string,
        data: { firstName: string; lastName: string; email?: string; phone?: string; organizationId?: string },
        owner = companyId,
      ) => {
        const created = await prisma.contact.create({
          data: {
            companyId: owner,
            firstName: data.firstName,
            lastName: data.lastName,
            identifiers: {
              create: [
                ...(data.email
                  ? [{ companyId: owner, provider: "mail" as const, channelClass: "email", value: data.email }]
                  : []),
                ...(data.phone
                  ? [{ companyId: owner, provider: "whatsapp" as const, channelClass: "phone", value: data.phone }]
                  : []),
              ],
            },
            ...(data.organizationId
              ? { organizations: { create: { companyId: owner, organizationId: data.organizationId } } }
              : {}),
          },
          select: { id: true },
        });
        contact[key] = created.id;
      };

      await make("ada", { firstName: "Ada", lastName: "Lovelace", email: "ada@acme.example" });
      await make("adaWork", { firstName: "Lovelace", lastName: "Ada", email: "a.lovelace@acme.example" });
      await make("jurgen", { firstName: "Jürgen", lastName: "Müller", phone: "+49 30 1234567" });
      await make("juergen", { firstName: "Juergen", lastName: "Mueller", phone: "030 123 4567" });
      await make("smith", { firstName: "Ann", lastName: "Smith", organizationId: organization.id });
      await make("anneSmith", { firstName: "Anne", lastName: "Smith", organizationId: organization.id });
      await make("loner", { firstName: "Grace", lastName: "Hopper" });
      await make("foreignAda", { firstName: "Ada", lastName: "Lovelace" }, otherCompanyId);
    });
  });

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } }));
    await prisma.$disconnect();
  });

  async function runScan() {
    const scan = await runWithoutTenant(() =>
      prisma.duplicateScan.create({
        data: { companyId, entityType: EntityType.contact, startedByUserId: admin },
        select: { id: true },
      }),
    );

    let cursor: string | null = null;
    let pages = 0;
    do {
      const step = await runAsBackgroundTenant(admin, () =>
        di.getRebuildDuplicateMatchKeysInteractor().invoke({ scanId: scan.id, cursor }),
      );
      if (!step.ok) throw new Error("rebuild step failed");
      cursor = step.data.nextCursor;
      pages++;
    } while (cursor !== null && pages < 10);

    const finished = await runAsBackgroundTenant(admin, () =>
      di.getFinishDuplicateScanInteractor().invoke({ scanId: scan.id }),
    );
    if (!finished.ok) throw new Error("finish step failed");

    const listed = await runAsBackgroundTenant(admin, () =>
      di.getGetDuplicateGroupsInteractor().invoke({ entityType: EntityType.contact }),
    );
    if (!listed.ok) throw new Error("listing failed");

    return listed.data;
  }

  const memberSets = (groups: Awaited<ReturnType<typeof runScan>>["groups"]) =>
    groups.map((group) => group.members.map((member) => member.id).sort());

  it("groups swapped names, spelling variants with the same phone, and colleagues with sound-alike surnames", async () => {
    const result = await runScan();

    expect(result.scan).toMatchObject({ status: "completed", recordCount: 7, groupCount: 3 });
    expect(memberSets(result.groups)).toEqual(
      expect.arrayContaining([
        [contact.ada, contact.adaWork].sort(),
        [contact.jurgen, contact.juergen].sort(),
        [contact.smith, contact.anneSmith].sort(),
      ]),
    );
    const phoneGroup = result.groups.find((group) => group.members.some((member) => member.id === contact.jurgen));
    expect(phoneGroup?.signals).toContain(DuplicateMatchKeyKind.phoneLast7);
    expect(phoneGroup?.members.find((member) => member.id === contact.jurgen)).toMatchObject({
      phones: ["+49 30 1234567"],
    });

    const allMembers = result.groups.flatMap((group) => group.members.map((member) => member.id));
    expect(allMembers).not.toContain(contact.loner);
    expect(allMembers).not.toContain(contact.foreignAda);
  });

  it("keeps a dismissed group out of every later scan", async () => {
    const before = await runScan();
    const adaGroup = before.groups.find((group) => group.members.some((member) => member.id === contact.ada));

    const dismissed = await runAsBackgroundTenant(admin, () =>
      di.getDismissDuplicateGroupInteractor().invoke({ id: adaGroup?.id ?? "" }),
    );
    expect(dismissed).toEqual({ ok: true, data: { id: adaGroup?.id, dismissedPairs: 1 } });

    const after = await runScan();
    expect(memberSets(after.groups)).not.toContainEqual([contact.ada, contact.adaWork].sort());
    expect(after.groups).toHaveLength(before.groups.length - 1);

    const again = await runAsBackgroundTenant(admin, () =>
      di.getDismissDuplicateGroupInteractor().invoke({ id: adaGroup?.id ?? "" }),
    );
    expect(again.ok).toBe(false);
  });

  it("keeps the review to users who can read every contact", async () => {
    await expect(
      runAsBackgroundTenant(rep, () => di.getGetDuplicateGroupsInteractor().invoke({ entityType: EntityType.contact })),
    ).rejects.toThrow();
  });
});
