import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Action, Resource } from "@/generated/prisma";
import { runWithTenant, runWithoutTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";

import { PrismaRecordFileRepo } from "../prisma-record-file.repository";
import { PrismaLeadRepo } from "@/features/leads/prisma-lead.repository";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("record files on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const foreignCompanyId = randomUUID();
  const adminId = randomUUID();
  const repId = randomUUID();
  const outsiderId = randomUUID();
  const contactId = randomUUID();
  const dealId = randomUUID();
  const leadId = randomUUID();

  const admin: TenantUser = createMockUser({ id: adminId, companyId });
  const rep: TenantUser = {
    ...createMockUserWithPermissions([{ resource: Resource.contacts, action: Action.readOwn }]),
    id: repId,
    companyId,
  };
  const outsider: TenantUser = createMockUser({ id: outsiderId, companyId: foreignCompanyId });
  const as = <T>(user: TenantUser, fn: (repo: PrismaRecordFileRepo) => Promise<T>) =>
    runWithTenant(user, () => fn(new PrismaRecordFileRepo()));
  const pendingFile = (
    user: TenantUser,
    overrides: { recordId?: string; entityType?: "contact" | "deal" | "lead" } = {},
  ) =>
    as(user, (repo) =>
      repo.createPendingFile({
        entityType: overrides.entityType ?? "contact",
        recordId: overrides.recordId ?? contactId,
        storageKey: `${companyId}/recordFile/${overrides.recordId ?? contactId}/${randomUUID()}.pdf`,
        fileName: "Offer.pdf",
        contentType: "application/pdf",
        byteSize: 2048,
      }),
    );

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
      [contactId, "Pia", "Files", companyId],
    );
    await client.query(
      'INSERT INTO "Deal" ("id", "name", "companyId", "updatedAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
      [dealId, "Files deal", companyId],
    );
    await client.query(
      'INSERT INTO "Lead" ("id", "title", "companyId", "updatedAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
      [leadId, "Files lead", companyId],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM "RecordFile" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.query('DELETE FROM "Lead" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Deal" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Contact" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "User" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.end();
  });

  it("keeps a new file pending and out of the list until it is marked ready", async () => {
    const file = await pendingFile(admin);

    expect(file).toMatchObject({
      entityType: "contact",
      recordId: contactId,
      uploadedBy: { id: adminId, firstName: "Ada" },
    });
    await expect(as(admin, (repo) => repo.listReadyFiles("contact", contactId))).resolves.toEqual([]);
    await expect(as(admin, (repo) => repo.findPendingFileOrNull(file.id))).resolves.toMatchObject({ byteSize: 2048 });

    await expect(as(admin, (repo) => repo.markFileReadyOrNull(file.id))).resolves.toMatchObject({ id: file.id });
    await expect(as(admin, (repo) => repo.markFileReadyOrNull(file.id))).resolves.toBeNull();
    await expect(as(admin, (repo) => repo.listReadyFiles("contact", contactId))).resolves.toEqual([
      expect.objectContaining({ id: file.id, fileName: "Offer.pdf" }),
    ]);
  });

  it("never shows a file to another company", async () => {
    const file = await pendingFile(admin);
    await as(admin, (repo) => repo.markFileReadyOrNull(file.id));

    await expect(as(outsider, (repo) => repo.findReadyFileOrNull(file.id))).resolves.toBeNull();
    await expect(as(outsider, (repo) => repo.findFileOrNull(file.id))).resolves.toBeNull();
    await expect(as(outsider, (repo) => repo.deleteFile(file.id))).resolves.toBe(false);
  });

  it("follows the record's own access: a user who cannot see the contact sees none of its files", async () => {
    const file = await pendingFile(admin);
    await as(admin, (repo) => repo.markFileReadyOrNull(file.id));

    await expect(as(rep, (repo) => repo.isRecordAccessible("contact", contactId))).resolves.toBe(false);
    await expect(as(rep, (repo) => repo.listReadyFiles("contact", contactId))).resolves.toEqual([]);
    await expect(as(rep, (repo) => repo.findReadyFileOrNull(file.id))).resolves.toBeNull();
  });

  it("files a deal's attachment on the deal only", async () => {
    const file = await pendingFile(admin, { entityType: "deal", recordId: dealId });
    await as(admin, (repo) => repo.markFileReadyOrNull(file.id));

    await expect(as(admin, (repo) => repo.listReadyFiles("deal", dealId))).resolves.toEqual([
      expect.objectContaining({ id: file.id, entityType: "deal", recordId: dealId }),
    ]);
    await expect(as(admin, (repo) => repo.listReadyFiles("contact", contactId))).resolves.not.toContainEqual(
      expect.objectContaining({ id: file.id }),
    );
  });

  it("offers the sweep stale pending uploads and files whose record is gone, and nothing else", async () => {
    const fresh = await pendingFile(admin);
    const stale = await pendingFile(admin);
    await client.query(`UPDATE "RecordFile" SET "createdAt" = now() - interval '2 days' WHERE id = $1`, [stale.id]);
    const orphan = await pendingFile(admin, { entityType: "deal", recordId: dealId });
    await as(admin, (repo) => repo.markFileReadyOrNull(orphan.id));
    await client.query('DELETE FROM "Deal" WHERE id = $1', [dealId]);

    const sweepable = await runWithoutTenant(() =>
      new PrismaRecordFileRepo().findSweepableFilesUnscoped({
        pendingBefore: new Date(Date.now() - 24 * 60 * 60 * 1000),
        limit: 50,
      }),
    );
    const ids = sweepable.map((file) => file.id);

    expect(ids).toContain(stale.id);
    expect(ids).toContain(orphan.id);
    expect(ids).not.toContain(fresh.id);

    const removed = await runWithoutTenant(() => new PrismaRecordFileRepo().deleteFilesUnscoped([stale.id, orphan.id]));
    expect(removed).toBe(2);
    const left = await client.query('SELECT id FROM "RecordFile" WHERE id = ANY($1)', [
      [stale.id, orphan.id, fresh.id],
    ]);
    expect(left.rows.map((row) => row.id)).toEqual([fresh.id]);
  });

  it("keeps a lead's files on the lead, readable only by someone who can see the lead", async () => {
    const file = await pendingFile(admin, { entityType: "lead", recordId: leadId });
    await as(admin, (repo) => repo.markFileReadyOrNull(file.id));

    await expect(as(admin, (repo) => repo.isRecordAccessible("lead", leadId))).resolves.toBe(true);
    await expect(as(admin, (repo) => repo.listReadyFiles("lead", leadId))).resolves.toEqual([
      expect.objectContaining({ id: file.id, entityType: "lead", recordId: leadId }),
    ]);
    await expect(as(rep, (repo) => repo.listReadyFiles("lead", leadId))).resolves.toEqual([]);
    await expect(as(outsider, (repo) => repo.findReadyFileOrNull(file.id))).resolves.toBeNull();
  });

  it("moves a lead's files onto the deal it is converted into", async () => {
    const convertedDealId = randomUUID();
    await client.query(
      'INSERT INTO "Deal" ("id", "name", "companyId", "updatedAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
      [convertedDealId, "Converted deal", companyId],
    );
    const file = await pendingFile(admin, { entityType: "lead", recordId: leadId });
    await as(admin, (repo) => repo.markFileReadyOrNull(file.id));

    await runWithTenant(admin, () =>
      new PrismaLeadRepo().markLeadConvertedOrThrow({ id: leadId, dealId: convertedDealId, convertedAt: new Date() }),
    );

    await expect(as(admin, (repo) => repo.listReadyFiles("lead", leadId))).resolves.toEqual([]);
    await expect(as(admin, (repo) => repo.listReadyFiles("deal", convertedDealId))).resolves.toContainEqual(
      expect.objectContaining({ id: file.id, entityType: "deal", recordId: convertedDealId }),
    );
  });
});
