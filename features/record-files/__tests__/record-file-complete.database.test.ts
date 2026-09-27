import type { StorageProvider, StoredObjectStat } from "@/core/storage/storage-provider";
import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { createTranslator } from "next-intl";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import messages from "@/i18n/locales/en.json";

vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: (namespace?: "Common.errors") =>
    Promise.resolve(createTranslator({ locale: "en", messages, namespace })),
}));
vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    DATABASE_URL: process.env.DATABASE_URL,
    BASE_URL: "http://localhost:4000",
    NODE_ENV: "test",
  },
}));

const { runWithTenant } = await import("@/core/decorators/tenant-context");
const { PrismaRecordFileRepo } = await import("../prisma-record-file.repository");
const { CompleteRecordFileUploadInteractor } = await import("../upload/complete-record-file-upload.interactor");
const { DeleteRecordFileInteractor } = await import("../delete/delete-record-file.interactor");

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

const userService = { hasPermissionForUser: () => true } as never;

function storageWith(stat: StoredObjectStat | null) {
  const deleteObject = vi.fn(() => Promise.resolve());
  const storage = {
    configured: true,
    maxUploadBytes: 1024 * 1024,
    statObject: vi.fn(() => Promise.resolve(stat)),
    deleteObject,
  } as unknown as StorageProvider;

  return { storage, deleteObject };
}

describeDatabase("record file writes that call storage, on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const adminId = randomUUID();
  const contactId = randomUUID();
  const admin: TenantUser = createMockUser({ id: adminId, companyId });

  const pendingFile = () =>
    runWithTenant(admin, () =>
      new PrismaRecordFileRepo().createPendingFile({
        entityType: "contact",
        recordId: contactId,
        storageKey: `${companyId}/recordFile/${contactId}/${randomUUID()}.pdf`,
        fileName: "Offer.pdf",
        contentType: "application/pdf",
        byteSize: 2048,
      }),
    );
  const statusOf = async (id: string) =>
    (await client.query<{ status: string }>('SELECT status FROM "RecordFile" WHERE id = $1', [id])).rows[0]?.status ??
    null;

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
      [adminId, `admin-${adminId}@example.invalid`, "Ada", "Admin", companyId],
    );
    await client.query(
      'INSERT INTO "Contact" ("id", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
      [contactId, "Pia", "Files", companyId],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM "RecordFile" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Contact" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "User" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  it("removes a mismatched upload's entry for real, not only inside a rolled-back transaction", async () => {
    const file = await pendingFile();
    const { storage, deleteObject } = storageWith({ byteSize: 10, contentType: "application/pdf" });

    const result = await runWithTenant(admin, () =>
      new CompleteRecordFileUploadInteractor(new PrismaRecordFileRepo(), storage, userService).invoke({ id: file.id }),
    );

    expect(result.ok).toBe(false);
    expect(deleteObject).toHaveBeenCalledTimes(1);
    await expect(statusOf(file.id)).resolves.toBeNull();
  });

  it("keeps an upload that has not arrived yet pending, and lists it once it has", async () => {
    const file = await pendingFile();

    const early = await runWithTenant(admin, () =>
      new CompleteRecordFileUploadInteractor(new PrismaRecordFileRepo(), storageWith(null).storage, userService).invoke(
        { id: file.id },
      ),
    );
    await expect(statusOf(file.id)).resolves.toBe("pending");

    const done = await runWithTenant(admin, () =>
      new CompleteRecordFileUploadInteractor(
        new PrismaRecordFileRepo(),
        storageWith({ byteSize: 2048, contentType: "application/pdf" }).storage,
        userService,
      ).invoke({ id: file.id }),
    );

    expect(early.ok).toBe(false);
    expect(done.ok).toBe(true);
    await expect(statusOf(file.id)).resolves.toBe("ready");
  });

  it("deletes the stored object and then the entry", async () => {
    const file = await pendingFile();
    const { storage, deleteObject } = storageWith(null);

    const result = await runWithTenant(admin, () =>
      new DeleteRecordFileInteractor(new PrismaRecordFileRepo(), storage, userService).invoke({ id: file.id }),
    );

    expect(result).toEqual({ ok: true, data: { id: file.id } });
    expect(deleteObject).toHaveBeenCalledTimes(1);
    await expect(statusOf(file.id)).resolves.toBeNull();
  });
});
