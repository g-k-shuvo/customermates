import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { Action, RecordDocumentStatus, Resource } from "@/generated/prisma";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    DATABASE_URL: process.env.DATABASE_URL,
    BASE_URL: "http://localhost:4000",
    NODE_ENV: "test",
  },
}));

const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { PrismaRecordDocumentRepo } = await import("../../prisma-record-document.repository");

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("record document signing on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const adminId = randomUUID();
  const repId = randomUUID();
  const contactId = randomUUID();
  const hiddenContactId = randomUUID();
  const organizationId = randomUUID();
  const dealId = randomUUID();

  const admin: TenantUser = createMockUser({ id: adminId, companyId });
  const rep: TenantUser = {
    ...createMockUserWithPermissions([
      { resource: Resource.deals, action: Action.readAll },
      { resource: Resource.contacts, action: Action.readOwn },
    ]),
    id: repId,
    companyId,
  };
  const as = <T>(user: TenantUser, fn: (repo: InstanceType<typeof PrismaRecordDocumentRepo>) => Promise<T>) =>
    runWithTenant(user, () => fn(new PrismaRecordDocumentRepo()));
  const unscoped = <T>(fn: (repo: InstanceType<typeof PrismaRecordDocumentRepo>) => Promise<T>) =>
    runWithoutTenant(() => fn(new PrismaRecordDocumentRepo()));

  const listedDocument = async () => {
    const created = await as(admin, (repo) =>
      repo.createDocumentWithPendingOriginal({
        entityType: "deal",
        recordId: dealId,
        title: "Mutual NDA",
        status: RecordDocumentStatus.draft,
        storageKey: `${companyId}/document/${dealId}/${randomUUID()}.pdf`,
        fileName: "NDA.pdf",
        byteSize: 100,
      }),
    );
    await as(admin, async (repo) => {
      const pending = await repo.findPendingFileOrNull(created.document.id, created.file.id);
      if (!pending) throw new Error("expected a pending original");
      await repo.markFileReadyOrNull(pending, []);
    });
    return created.document.id;
  };

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP), ($6, $7, $8, $9, $5, CURRENT_TIMESTAMP)',
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
      ],
    );
    await client.query(
      'INSERT INTO "Contact" ("id", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP), ($5, $6, $7, $4, CURRENT_TIMESTAMP)',
      [contactId, "Pia", "Müller", companyId, hiddenContactId, "Hanna", "Hidden"],
    );
    await client.query(
      `INSERT INTO "ContactIdentifier" ("id", "companyId", "contactId", "provider", "channelClass", "value", "updatedAt") VALUES ($1, $2, $3, 'mail', 'email', $4, CURRENT_TIMESTAMP), ($5, $2, $6, 'mail', 'email', $7, CURRENT_TIMESTAMP)`,
      [
        randomUUID(),
        companyId,
        contactId,
        `pia-${companyId}@example.test`,
        randomUUID(),
        hiddenContactId,
        `hanna-${companyId}@example.test`,
      ],
    );
    await client.query(
      'INSERT INTO "Organization" ("id", "name", "companyId", "updatedAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
      [organizationId, "Signing Org", companyId],
    );
    await client.query(
      'INSERT INTO "ContactOrganization" ("id", "contactId", "organizationId", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
      [randomUUID(), contactId, organizationId, companyId],
    );
    await client.query(
      'INSERT INTO "Deal" ("id", "name", "companyId", "updatedAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
      [dealId, "Signing deal", companyId],
    );
    await client.query(
      'INSERT INTO "DealContact" ("id", "dealId", "contactId", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP), ($5, $2, $6, $4, CURRENT_TIMESTAMP)',
      [randomUUID(), dealId, contactId, companyId, randomUUID(), hiddenContactId],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM "RecordDocument" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "DealContact" WHERE "dealId" = $1', [dealId]);
    await client.query('DELETE FROM "ContactOrganization" WHERE "organizationId" = $1', [organizationId]);
    await client.query('DELETE FROM "Deal" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Organization" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "ContactIdentifier" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Contact" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "User" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  it("records a sent envelope and shows it on the document", async () => {
    const id = await listedDocument();
    const sentAt = new Date("2026-09-27T10:00:00Z");

    const sent = await as(admin, (repo) =>
      repo.recordEnvelopeSentOrNull(id, {
        envelopeId: `env-${id}`,
        recipients: [{ name: "Pia Müller", email: "pia@example.test", status: "sent", completedAt: null }],
        sentAt,
      }),
    );

    expect(sent).toMatchObject({
      status: "sent",
      statusChangedAt: sentAt,
      signature: {
        provider: "docusign",
        status: "sent",
        sentAt,
        recipients: [{ name: "Pia Müller", email: "pia@example.test", status: "sent", completedAt: null }],
      },
    });
    await expect(as(admin, (repo) => repo.findSignableDocumentOrNull(id))).resolves.toMatchObject({
      envelopeId: `env-${id}`,
      envelopeStatus: "sent",
      original: { fileName: "NDA.pdf" },
      creator: { email: `admin-${adminId}@example.invalid` },
    });
  });

  it("finds a document by its envelope without a tenant, and completes it once", async () => {
    const id = await listedDocument();
    await as(admin, (repo) =>
      repo.recordEnvelopeSentOrNull(id, { envelopeId: `env-${id}`, recipients: [], sentAt: new Date() }),
    );

    const found = await unscoped((repo) => repo.findDocumentByEnvelopeUnscoped(`env-${id}`));
    const signedAt = new Date("2026-09-27T11:00:00Z");
    const recipients = [{ name: "Pia Müller", email: "pia@example.test", status: "completed", completedAt: signedAt }];
    const first = await unscoped((repo) =>
      repo.recordEnvelopeStateUnscoped({
        companyId,
        documentId: id,
        envelopeStatus: "completed",
        status: RecordDocumentStatus.completed,
        recipients,
      }),
    );
    const again = await unscoped((repo) =>
      repo.recordEnvelopeStateUnscoped({
        companyId,
        documentId: id,
        envelopeStatus: "completed",
        status: RecordDocumentStatus.completed,
        recipients,
      }),
    );

    expect(found).toMatchObject({ id, companyId, entityType: "deal", recordId: dealId, envelopeStatus: "sent" });
    await expect(unscoped((repo) => repo.findDocumentByEnvelopeUnscoped("env-unknown"))).resolves.toBeNull();
    expect(first).toEqual({ completedNow: true });
    expect(again).toEqual({ completedNow: false });
    await expect(as(admin, (repo) => repo.findListedDocumentOrNull(id))).resolves.toMatchObject({
      status: "completed",
      signature: { status: "completed", recipients },
    });
  });

  it("attaches DocuSign's completed PDF as the signed copy, replacing a manual one", async () => {
    const id = await listedDocument();
    const manual = await as(admin, (repo) =>
      repo.createPendingSignedFile({
        documentId: id,
        storageKey: `${companyId}/document/${dealId}/${randomUUID()}.pdf`,
        fileName: "manual.pdf",
        byteSize: 5,
      }),
    );
    await as(admin, async (repo) => {
      const pending = await repo.findPendingFileOrNull(id, manual.id);
      if (!pending) throw new Error("expected a pending signed copy");
      await repo.markFileReadyOrNull(pending, []);
    });

    const superseded = await unscoped((repo) =>
      repo.attachEnvelopeCopyUnscoped({
        companyId,
        documentId: id,
        storageKey: `${companyId}/document/${dealId}/${randomUUID()}.pdf`,
        fileName: "Mutual NDA (signed).pdf",
        byteSize: 42,
      }),
    );

    expect(superseded.map((file) => file.id)).toEqual([manual.id]);
    await expect(as(admin, (repo) => repo.findListedDocumentOrNull(id))).resolves.toMatchObject({
      signed: { fileName: "Mutual NDA (signed).pdf", byteSize: 42, uploadedBy: null },
    });
  });

  it("suggests the record's people with an email, only those the caller can see", async () => {
    const forContact = await as(admin, (repo) => repo.suggestSignatureRecipients("contact", contactId, 10));
    const forOrganization = await as(admin, (repo) =>
      repo.suggestSignatureRecipients("organization", organizationId, 10),
    );
    const forDeal = await as(admin, (repo) => repo.suggestSignatureRecipients("deal", dealId, 10));
    const forDealAsRep = await as(rep, (repo) => repo.suggestSignatureRecipients("deal", dealId, 10));

    const pia = { name: "Pia Müller", email: `pia-${companyId}@example.test` };
    expect(forContact).toEqual([pia]);
    expect(forOrganization).toEqual([pia]);
    expect(forDeal).toEqual(
      expect.arrayContaining([pia, { name: "Hanna Hidden", email: `hanna-${companyId}@example.test` }]),
    );
    expect(forDeal).toHaveLength(2);
    expect(forDealAsRep).toEqual([]);
  });
});
