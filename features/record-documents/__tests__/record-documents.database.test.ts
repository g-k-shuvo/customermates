import type { StorageProvider, StoredObjectStat } from "@/core/storage/storage-provider";
import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { createTranslator } from "next-intl";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { Action, RecordDocumentFileKind, RecordDocumentStatus, Resource } from "@/generated/prisma";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
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

const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { PrismaRecordDocumentRepo } = await import("../prisma-record-document.repository");
const { CompleteRecordDocumentFileInteractor } = await import("../upload/complete-record-document-file.interactor");

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

const userService = { hasPermissionForUser: () => true } as never;

function storageWith(stat: StoredObjectStat | null) {
  const deleteObject = vi.fn(() => Promise.resolve());
  const storage = {
    configured: true,
    maxUploadBytes: 1024 * 1024,
    statObject: vi.fn(() => Promise.resolve(stat)),
    getObject: vi.fn(() => Promise.resolve({ body: new Blob(["%PDF-1.7"]).stream() })),
    deleteObject,
  } as unknown as StorageProvider;

  return { storage, deleteObject };
}

describeDatabase("record documents on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const foreignCompanyId = randomUUID();
  const adminId = randomUUID();
  const repId = randomUUID();
  const outsiderId = randomUUID();
  const contactId = randomUUID();
  const dealId = randomUUID();

  const admin: TenantUser = createMockUser({ id: adminId, companyId });
  const rep: TenantUser = {
    ...createMockUserWithPermissions([{ resource: Resource.contacts, action: Action.readOwn }]),
    id: repId,
    companyId,
  };
  const outsider: TenantUser = createMockUser({ id: outsiderId, companyId: foreignCompanyId });
  const as = <T>(user: TenantUser, fn: (repo: InstanceType<typeof PrismaRecordDocumentRepo>) => Promise<T>) =>
    runWithTenant(user, () => fn(new PrismaRecordDocumentRepo()));
  const key = (recordId: string) => `${companyId}/document/${recordId}/${randomUUID()}.pdf`;
  const draft = (overrides: { recordId?: string; entityType?: "contact" | "deal" } = {}) =>
    as(admin, (repo) =>
      repo.createDocumentWithPendingOriginal({
        entityType: overrides.entityType ?? "contact",
        recordId: overrides.recordId ?? contactId,
        title: "NDA",
        status: RecordDocumentStatus.draft,
        storageKey: key(overrides.recordId ?? contactId),
        fileName: "NDA.pdf",
        byteSize: 4096,
      }),
    );
  const pendingOf = (documentId: string, fileId: string) =>
    as(admin, async (repo) => {
      const pending = await repo.findPendingFileOrNull(documentId, fileId);
      if (!pending) throw new Error("expected a pending file");
      return pending;
    });
  const listed = async (overrides: { recordId?: string; entityType?: "contact" | "deal" } = {}) => {
    const created = await draft(overrides);
    const pending = await pendingOf(created.document.id, created.file.id);
    const document = await as(admin, (repo) => repo.markFileReadyOrNull(pending, []));
    if (!document) throw new Error("expected the document to be listed");
    return document;
  };
  const count = async (table: "RecordDocument" | "RecordDocumentFile", id: string) =>
    Number((await client.query(`SELECT count(*) AS n FROM "${table}" WHERE id = $1`, [id])).rows[0].n);

  beforeAll(async () => {
    await client.connect();
    await client.query(
      'INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP), ($2, CURRENT_TIMESTAMP)',
      [companyId, foreignCompanyId],
    );
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP), ($6, $7, $8, $9, $5, CURRENT_TIMESTAMP), ($10, $11, $12, $13, $14, CURRENT_TIMESTAMP)',
      [
        adminId,
        `admin-${adminId}@example.invalid`,
        "Ada",
        "Admin",
        companyId,
        repId,
        `rep-${repId}@example.invalid`,
        "Rita",
        "Rep",
        outsiderId,
        `outsider-${outsiderId}@example.invalid`,
        "Otto",
        "Outside",
        foreignCompanyId,
      ],
    );
    await client.query(
      'INSERT INTO "Contact" ("id", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
      [contactId, "Pia", "Documents", companyId],
    );
    await client.query(
      'INSERT INTO "Deal" ("id", "name", "companyId", "updatedAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
      [dealId, "Documents deal", companyId],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM "RecordDocument" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.query('DELETE FROM "Deal" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Contact" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "User" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.end();
  });

  it("keeps a new document out of the list until its PDF is marked ready", async () => {
    const created = await draft();

    expect(created.document).toMatchObject({ title: "NDA", status: "draft", original: null, recordId: contactId });
    expect(created.file).toMatchObject({ kind: "original", uploadedBy: { id: adminId, firstName: "Ada" } });
    await expect(as(admin, (repo) => repo.listDocuments("contact", contactId))).resolves.not.toContainEqual(
      expect.objectContaining({ id: created.document.id }),
    );
    await expect(as(admin, (repo) => repo.findListedDocumentOrNull(created.document.id))).resolves.toBeNull();

    const pending = await pendingOf(created.document.id, created.file.id);
    await as(admin, (repo) => repo.markFileReadyOrNull(pending, []));

    await expect(as(admin, (repo) => repo.listDocuments("contact", contactId))).resolves.toContainEqual(
      expect.objectContaining({
        id: created.document.id,
        original: expect.objectContaining({ id: created.file.id, fileName: "NDA.pdf" }),
        signed: null,
      }),
    );
    await expect(as(admin, (repo) => repo.markFileReadyOrNull(pending, []))).resolves.toBeNull();
  });

  it("marks a document signed when its executed copy lands, and a newer copy replaces the older", async () => {
    const document = await listed();
    await client.query(`UPDATE "RecordDocument" SET "statusChangedAt" = now() - interval '3 days' WHERE id = $1`, [
      document.id,
    ]);

    const first = await as(admin, (repo) =>
      repo.createPendingSignedFile({
        documentId: document.id,
        storageKey: key(contactId),
        fileName: "v1.pdf",
        byteSize: 10,
      }),
    );
    const firstPending = await pendingOf(document.id, first.id);
    const signed = await as(admin, (repo) => repo.markFileReadyOrNull(firstPending, []));

    expect(signed).toMatchObject({ status: "completed", signed: expect.objectContaining({ fileName: "v1.pdf" }) });
    expect(signed?.statusChangedAt.getTime()).toBeGreaterThan(Date.now() - 60_000);

    const second = await as(admin, (repo) =>
      repo.createPendingSignedFile({
        documentId: document.id,
        storageKey: key(contactId),
        fileName: "v2.pdf",
        byteSize: 11,
      }),
    );
    const superseded = await as(admin, (repo) => repo.findSupersededSignedFiles(document.id, second.id));
    const secondPending = await pendingOf(document.id, second.id);
    const replaced = await as(admin, (repo) => repo.markFileReadyOrNull(secondPending, superseded));

    expect(superseded.map((file) => file.id)).toEqual([first.id]);
    expect(replaced).toMatchObject({ status: "completed", signed: expect.objectContaining({ id: second.id }) });
    await expect(count("RecordDocumentFile", first.id)).resolves.toBe(0);
    await expect(as(admin, (repo) => repo.findListedDocumentPdfsOrNull(document.id))).resolves.toEqual({
      original: { storageKey: expect.any(String), fileName: "NDA.pdf" },
      signed: { storageKey: expect.any(String), fileName: "v2.pdf" },
    });
  });

  it("never shows a document to another company, nor to a user who cannot see its record", async () => {
    const document = await listed();

    await expect(as(outsider, (repo) => repo.findListedDocumentOrNull(document.id))).resolves.toBeNull();
    await expect(as(outsider, (repo) => repo.findDocumentOrNull(document.id))).resolves.toBeNull();
    await expect(as(outsider, (repo) => repo.deleteDocument(document.id))).resolves.toBe(false);
    await expect(
      as(outsider, (repo) => repo.updateDocumentOrNull(document.id, { title: "Taken" })),
    ).resolves.toBeNull();
    await expect(as(rep, (repo) => repo.isRecordAccessible("contact", contactId))).resolves.toBe(false);
    await expect(as(rep, (repo) => repo.listDocuments("contact", contactId))).resolves.toEqual([]);
    await expect(as(rep, (repo) => repo.findListedDocumentPdfsOrNull(document.id))).resolves.toBeNull();
    await expect(as(admin, (repo) => repo.findListedDocumentOrNull(document.id))).resolves.toMatchObject({
      title: "NDA",
    });
  });

  it("moves statusChangedAt only when the status changes", async () => {
    const document = await listed();
    await client.query(`UPDATE "RecordDocument" SET "statusChangedAt" = '2026-01-01' WHERE id = $1`, [document.id]);

    const renamed = await as(admin, (repo) => repo.updateDocumentOrNull(document.id, { title: "Mutual NDA" }));
    const sent = await as(admin, (repo) =>
      repo.updateDocumentOrNull(document.id, { status: RecordDocumentStatus.sent }),
    );

    expect(renamed).toMatchObject({ title: "Mutual NDA", status: "draft" });
    expect(renamed?.statusChangedAt.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(sent).toMatchObject({ title: "Mutual NDA", status: "sent" });
    expect(sent?.statusChangedAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it("discards a mismatched first upload with its document, for real, but keeps a document whose signed copy failed", async () => {
    const created = await draft();
    const { storage, deleteObject } = storageWith({ byteSize: 1, contentType: "application/pdf" });

    const result = await runWithTenant(admin, () =>
      new CompleteRecordDocumentFileInteractor(new PrismaRecordDocumentRepo(), storage, userService).invoke({
        id: created.document.id,
        fileId: created.file.id,
      }),
    );

    expect(result.ok).toBe(false);
    expect(deleteObject).toHaveBeenCalledTimes(1);
    await expect(count("RecordDocument", created.document.id)).resolves.toBe(0);

    const document = await listed();
    const signed = await as(admin, (repo) =>
      repo.createPendingSignedFile({
        documentId: document.id,
        storageKey: key(contactId),
        fileName: "s.pdf",
        byteSize: 99,
      }),
    );
    await runWithTenant(admin, () =>
      new CompleteRecordDocumentFileInteractor(new PrismaRecordDocumentRepo(), storage, userService).invoke({
        id: document.id,
        fileId: signed.id,
      }),
    );

    await expect(count("RecordDocumentFile", signed.id)).resolves.toBe(0);
    await expect(as(admin, (repo) => repo.findListedDocumentOrNull(document.id))).resolves.toMatchObject({
      status: "draft",
      signed: null,
    });
  });

  it("completes through the interactor, marking a signed copy's document completed", async () => {
    const document = await listed({ entityType: "deal", recordId: dealId });
    const signed = await as(admin, (repo) =>
      repo.createPendingSignedFile({
        documentId: document.id,
        storageKey: key(dealId),
        fileName: "s.pdf",
        byteSize: 99,
      }),
    );

    const result = await runWithTenant(admin, () =>
      new CompleteRecordDocumentFileInteractor(
        new PrismaRecordDocumentRepo(),
        storageWith({ byteSize: 99, contentType: "application/pdf" }).storage,
        userService,
      ).invoke({ id: document.id, fileId: signed.id }),
    );

    expect(result).toMatchObject({
      ok: true,
      data: { id: document.id, entityType: "deal", recordId: dealId, status: RecordDocumentStatus.completed },
    });
    await expect(as(admin, (repo) => repo.listDocuments("deal", dealId))).resolves.toContainEqual(
      expect.objectContaining({
        id: document.id,
        signed: expect.objectContaining({ kind: RecordDocumentFileKind.signed }),
      }),
    );
  });

  it("offers the sweep stale uploads and orphaned PDFs, then removes documents left without any", async () => {
    const fresh = await draft();
    const stale = await draft();
    await client.query(`UPDATE "RecordDocumentFile" SET "createdAt" = now() - interval '2 days' WHERE id = $1`, [
      stale.file.id,
    ]);
    await client.query(`UPDATE "RecordDocument" SET "createdAt" = now() - interval '2 days' WHERE id = $1`, [
      stale.document.id,
    ]);
    const orphan = await listed({ entityType: "deal", recordId: dealId });
    await client.query('DELETE FROM "Deal" WHERE id = $1', [dealId]);

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sweepable = await runWithoutTenant(() =>
      new PrismaRecordDocumentRepo().findSweepableDocumentFilesUnscoped({ pendingBefore: cutoff, limit: 500 }),
    );
    const ids = sweepable.map((file) => file.id);

    expect(ids).toContain(stale.file.id);
    expect(ids).toContain(orphan.original?.id);
    expect(ids).not.toContain(fresh.file.id);

    await runWithoutTenant(() =>
      new PrismaRecordDocumentRepo().deleteDocumentFilesUnscoped([stale.file.id, orphan.original?.id ?? ""]),
    );
    const removed = await runWithoutTenant(() =>
      new PrismaRecordDocumentRepo().deleteEmptyDocumentsUnscoped({ createdBefore: cutoff, limit: 500 }),
    );

    expect(removed).toBeGreaterThanOrEqual(2);
    await expect(count("RecordDocument", stale.document.id)).resolves.toBe(0);
    await expect(count("RecordDocument", orphan.id)).resolves.toBe(0);
    await expect(count("RecordDocument", fresh.document.id)).resolves.toBe(1);
  });

  it("deletes a document together with its file entries", async () => {
    const document = await listed();
    const stored = await as(admin, (repo) => repo.findDocumentOrNull(document.id));

    expect(stored?.storageKeys).toHaveLength(1);
    await expect(as(admin, (repo) => repo.deleteDocument(document.id))).resolves.toBe(true);
    await expect(count("RecordDocumentFile", document.original?.id ?? "")).resolves.toBe(0);
  });
});
