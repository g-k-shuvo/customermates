import { randomUUID } from "node:crypto";

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
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runAsBackgroundTenant } = await import("@/core/decorators/background-tenant");
const { EntityType } = await import("@/generated/prisma");
const { PrismaStorageUsageRepo } = await import("../prisma-storage-usage.repository");
const { StorageQuota, storageQuotaBytesOf } = await import("../storage-quota");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("workspace storage usage", () => {
  const companyIds: string[] = [];

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companyIds } } }));
    await prisma.$disconnect();
  });

  const workspace = async (fileSizes: number[]) =>
    runWithoutTenant(async () => {
      const company = await prisma.company.create({ data: {}, select: { id: true } });
      companyIds.push(company.id);
      const role = await prisma.userRole.create({
        data: { companyId: company.id, name: "Admin", isSystemRole: true },
        select: { id: true },
      });
      const user = await prisma.user.create({
        data: {
          companyId: company.id,
          roleId: role.id,
          email: `quota-${randomUUID()}@example.invalid`,
          firstName: "Q",
          lastName: "U",
          status: "active",
        },
        select: { id: true },
      });
      for (const byteSize of fileSizes) {
        await prisma.recordFile.create({
          data: {
            companyId: company.id,
            entityType: EntityType.contact,
            storageKey: `${company.id}/recordFile/${randomUUID()}`,
            fileName: "file.pdf",
            contentType: "application/pdf",
            byteSize,
          },
        });
      }

      return user.id;
    });

  it("sums the workspace's own stored bytes and applies the quota", async () => {
    const mine = await workspace([1000, 2500]);
    await workspace([999_999]);

    const repo = new PrismaStorageUsageRepo();
    const used = await runAsBackgroundTenant(mine, () => repo.usedBytesCompanyWide());
    expect(used).toBe(3500);

    const quota = new StorageQuota(repo, 4000);
    expect(await runAsBackgroundTenant(mine, () => quota.allows(500))).toBe(true);
    expect(await runAsBackgroundTenant(mine, () => quota.allows(501))).toBe(false);
    expect(await runAsBackgroundTenant(mine, () => quota.usage())).toEqual({ usedBytes: 3500, quotaBytes: 4000 });
  });

  it("reads the quota setting in megabytes and refuses nonsense", () => {
    expect(storageQuotaBytesOf(undefined)).toBeNull();
    expect(storageQuotaBytesOf("")).toBeNull();
    expect(storageQuotaBytesOf("2")).toBe(2 * 1024 * 1024);
    expect(() => storageQuotaBytesOf("0")).toThrow();
    expect(() => storageQuotaBytesOf("1.5")).toThrow();
  });
});
