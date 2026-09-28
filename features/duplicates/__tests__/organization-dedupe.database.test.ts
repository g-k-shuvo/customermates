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
const { DuplicateMatchKeyKind, EntityType } = await import("@/generated/prisma");
const di = await import("@/core/di");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("organization duplicates and import review", () => {
  const companyId = randomUUID();
  let admin: string;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: companyId } });
      const role = await prisma.userRole.create({
        data: { companyId, name: `Admin ${randomUUID()}`, isSystemRole: true },
        select: { id: true },
      });
      admin = (
        await prisma.user.create({
          data: {
            companyId,
            roleId: role.id,
            email: `admin-${randomUUID()}@example.invalid`,
            firstName: "Admin",
            lastName: "Tester",
            status: "active",
          },
          select: { id: true },
        })
      ).id;

      const org = (name: string) =>
        prisma.organization.create({ data: { companyId, name }, select: { id: true } }).then((row) => row.id);
      ids.acmeGmbh = await org("Acme GmbH");
      ids.acme = await org("ACME");
      ids.globex = await org("Globex Corporation");
      ids.initech = await org("Initech");
      ids.initrode = await org("Initrode Systems");

      const contact = (firstName: string, email: string, organizationId: string) =>
        prisma.contact
          .create({
            data: {
              companyId,
              firstName,
              lastName: "Tester",
              identifiers: { create: { companyId, provider: "mail", channelClass: "email", value: email } },
              organizations: { create: { companyId, organizationId } },
            },
            select: { id: true },
          })
          .then((row) => row.id);
      ids.initechContact = await contact("Peter", `peter-${randomUUID()}@initech.example`, ids.initech);
      ids.initrodeContact = await contact("Milton", `milton-${randomUUID()}@initech.example`, ids.initrode);
      ids.deal = (
        await prisma.deal.create({
          data: { companyId, name: "Acme renewal", organizations: { create: { companyId, organizationId: ids.acme } } },
          select: { id: true },
        })
      ).id;
    });
  });

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: companyId } }));
    await prisma.$disconnect();
  });

  it("groups organizations by name without legal form, and by a shared company email domain", async () => {
    const scan = await runWithoutTenant(() =>
      prisma.duplicateScan.create({
        data: { companyId, entityType: EntityType.organization, startedByUserId: admin },
        select: { id: true },
      }),
    );

    let cursor: string | null = null;
    do {
      const step = await runAsBackgroundTenant(admin, () =>
        di.getRebuildDuplicateMatchKeysInteractor().invoke({ scanId: scan.id, cursor }),
      );
      cursor = step.ok ? step.data.nextCursor : null;
    } while (cursor !== null);
    await runAsBackgroundTenant(admin, () => di.getFinishDuplicateScanInteractor().invoke({ scanId: scan.id }));

    const listed = await runAsBackgroundTenant(admin, () =>
      di.getGetDuplicateGroupsInteractor().invoke({ entityType: EntityType.organization }),
    );
    const groups = listed.ok ? listed.data.groups : [];
    const sets = groups.map((group) => group.members.map((member) => member.id).sort());

    expect(sets).toContainEqual([ids.acmeGmbh, ids.acme].sort());
    expect(sets).toContainEqual([ids.initech, ids.initrode].sort());
    expect(sets.flat()).not.toContain(ids.globex);
    expect(groups.find((group) => group.members.some((member) => member.id === ids.initech))?.signals).toContain(
      DuplicateMatchKeyKind.organizationDomain,
    );
  });

  it("merges organizations, moving contacts and deals, and undoes the merge", async () => {
    const merged = await runAsBackgroundTenant(admin, () =>
      di.getMergeOrganizationsInteractor().invoke({
        winnerId: ids.acmeGmbh,
        loserIds: [ids.acme],
        fields: { name: ids.acmeGmbh },
      }),
    );
    expect(merged.ok).toBe(true);

    const dealOrganizations = () =>
      runWithoutTenant(() =>
        prisma.dealOrganization.findMany({ where: { dealId: ids.deal }, select: { organizationId: true } }),
      );
    expect(await dealOrganizations()).toEqual([{ organizationId: ids.acmeGmbh }]);
    expect(await runWithoutTenant(() => prisma.organization.findUnique({ where: { id: ids.acme } }))).toBeNull();

    const merges = await runAsBackgroundTenant(admin, () => di.getGetOrganizationMergesInteractor().invoke());
    const mergeId = merges.ok ? merges.data[0]?.id : undefined;
    const undone = await runAsBackgroundTenant(admin, () =>
      di.getUndoOrganizationMergeInteractor().invoke({ id: mergeId ?? "" }),
    );
    expect(undone.ok).toBe(true);

    expect(await dealOrganizations()).toEqual([{ organizationId: ids.acme }]);
    expect(
      (
        await runWithoutTenant(() =>
          prisma.organization.findUnique({ where: { id: ids.acme }, select: { name: true } }),
        )
      )?.name,
    ).toBe("ACME");
  });

  it("opens a review group for an imported record that matched an existing one, once", async () => {
    const review = { recordId: ids.globex, matchIds: [ids.initech] };

    const first = await runAsBackgroundTenant(admin, () =>
      di.getOpenImportReviewGroupsInteractor().invoke({ entityType: EntityType.organization, reviews: [review] }),
    );
    const again = await runAsBackgroundTenant(admin, () =>
      di.getOpenImportReviewGroupsInteractor().invoke({ entityType: EntityType.organization, reviews: [review] }),
    );
    expect(first).toEqual({ ok: true, data: { opened: 1 } });
    expect(again.ok).toBe(true);

    const groups = await runWithoutTenant(() =>
      prisma.duplicateGroup.findMany({
        where: { companyId, status: "open", scanId: null, members: { some: { organizationId: ids.globex } } },
        select: { members: { select: { organizationId: true } } },
      }),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].members.map((member) => member.organizationId).sort()).toEqual([ids.globex, ids.initech].sort());
  });
});
