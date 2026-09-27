import { randomUUID } from "node:crypto";

import { createTranslator } from "next-intl";
import { afterAll, describe, expect, it, vi } from "vitest";

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
const { getCreateWebFormSourceInteractor } = await import("@/core/di");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companyIds: string[] = [];

async function makeCompanyWithAdmin() {
  return runWithoutTenant(async () => {
    const company = await prisma.company.create({ data: {} });
    companyIds.push(company.id);

    const role = await prisma.userRole.create({
      data: { companyId: company.id, name: "Admin", isSystemRole: true },
      select: { id: true },
    });
    const admin = await prisma.user.create({
      data: {
        companyId: company.id,
        roleId: role.id,
        email: `admin-${company.id}@example.invalid`,
        firstName: "Company",
        lastName: "Admin",
        status: "active",
      },
      select: { id: true },
    });

    return { companyId: company.id, adminId: admin.id };
  });
}

function createSource(actingUserId: string, defaultOwnerId?: string) {
  return runAsBackgroundTenant(actingUserId, () =>
    getCreateWebFormSourceInteractor().invoke({
      name: "Website contact form",
      slug: `website-${randomUUID()}`,
      ...(defaultOwnerId ? { defaultOwnerId } : {}),
      fieldMapping: { email: "fields.email" },
    } as never),
  );
}

describeDatabase("naming a default owner when a web form source is created", () => {
  afterAll(async () => {
    await runWithoutTenant(async () => {
      for (const companyId of companyIds) await prisma.company.delete({ where: { id: companyId } });
    });
    await prisma.$disconnect();
  });

  it("refuses a default owner from another company", async () => {
    const mine = await makeCompanyWithAdmin();
    const theirs = await makeCompanyWithAdmin();

    const created = await createSource(mine.adminId, theirs.adminId);

    expect(created.ok).toBe(false);
    if (created.ok) return;
    expect(serializeInteractorFailure(created.error).issues).toEqual([
      expect.objectContaining({ path: ["defaultOwnerId"], customCode: CustomErrorCode.userNotFound }),
    ]);
    const stored = await runWithoutTenant(() => prisma.webFormSource.count({ where: { companyId: mine.companyId } }));
    expect(stored).toBe(0);
  });

  it("accepts a default owner from the creator's own company, or none", async () => {
    const mine = await makeCompanyWithAdmin();

    const owned = await createSource(mine.adminId, mine.adminId);
    const unowned = await createSource(mine.adminId);

    expect(owned).toMatchObject({ ok: true, data: { defaultOwnerId: mine.adminId } });
    expect(unowned).toMatchObject({ ok: true, data: { defaultOwnerId: null } });
  });
});
