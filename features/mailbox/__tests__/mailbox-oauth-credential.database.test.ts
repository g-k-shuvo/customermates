import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { runWithTenant } from "@/core/decorators/tenant-context";

import { parseSecretBoxKey } from "../credentials/secret-box";
import { PrismaMailboxRepo } from "../persistence/prisma-mailbox.repository";
import { MailboxCredentialAuth } from "../oauth/mailbox-credential-auth";
import { mailboxOAuthSettingsFrom } from "../oauth/mailbox-oauth-providers";
import { openMailboxTokenBundle, sealMailboxTokenBundle } from "../oauth/mailbox-oauth-tokens";

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

const KEY = parseSecretBoxKey(Buffer.alloc(32, 9).toString("base64"));
const companyId = randomUUID();
const owner = createMockUser({ id: randomUUID(), companyId, email: `owner-${randomUUID().slice(0, 8)}@example.com` });
const colleague = createMockUser({
  id: randomUUID(),
  companyId,
  email: `peer-${randomUUID().slice(0, 8)}@example.com`,
});
const MAILBOX = `ana-${randomUUID().slice(0, 8)}@gmail.com`;

const SETTINGS = mailboxOAuthSettingsFrom({
  MAILBOX_GOOGLE_CLIENT_ID: "google-client",
  MAILBOX_GOOGLE_CLIENT_SECRET: "google-secret",
  BASE_URL: "https://crm.example.com",
});

async function prismaClient() {
  const { prisma } = await import("@/prisma/db");

  return prisma;
}

describeDatabase("OAuth mailbox credentials", () => {
  let connectedAccountId = "";

  beforeAll(async () => {
    const prisma = await prismaClient();

    await runWithTenant(owner, async () => {
      await prisma.company.create({ data: { id: companyId, updatedAt: new Date() } });
      for (const user of [owner, colleague]) {
        await prisma.user.create({
          data: { id: user.id, companyId, email: user.email, firstName: "Test", lastName: "User" },
        });
      }

      const created = await new PrismaMailboxRepo().createMailboxOrThrow({
        emailAddress: MAILBOX,
        displayName: "Ana",
        imapHost: "imap.gmail.com",
        imapPort: 993,
        imapSecure: true,
        username: MAILBOX,
        sealedSecret: sealMailboxTokenBundle(KEY, {
          refreshToken: "rt-1",
          accessToken: "at-old",
          expiresAt: "2026-01-01T00:00:00.000Z",
        }),
        oauthProvider: "google",
        smtpHost: "smtp.gmail.com",
        smtpPort: 465,
        smtpSecure: true,
        backfillFrom: new Date("2026-07-01T00:00:00Z"),
        verifiedAt: new Date(),
      });
      connectedAccountId = created.connectedAccountId;
    });
  }, 60_000);

  afterAll(async () => {
    const prisma = await prismaClient();

    await runWithTenant(owner, async () => {
      await prisma.company.delete({ where: { id: companyId } });
    });
  }, 60_000);

  it("stores the provider and returns it with the account", async () => {
    const accounts = await runWithTenant(owner, () => new PrismaMailboxRepo().getMailboxAccounts());

    expect(accounts.map((account) => [account.emailAddress, account.oauthProvider, account.imapHost])).toEqual([
      [MAILBOX, "google", "imap.gmail.com"],
    ]);
  });

  it("refreshes an expired token and saves the new bundle on the owner's credential only", async () => {
    const fetcher = () =>
      Promise.resolve(new Response(JSON.stringify({ access_token: "at-new", expires_in: 3600 }), { status: 200 }));

    const resolved = await runWithTenant(owner, async () => {
      const repo = new PrismaMailboxRepo();
      const [account] = await repo.getMailboxAccounts();
      if (!account) throw new Error("mailbox missing");

      return await new MailboxCredentialAuth(KEY, SETTINGS, repo, fetcher, () => new Date()).resolve(account);
    });
    await runWithTenant(colleague, () => new PrismaMailboxRepo().saveSealedSecret(connectedAccountId, "tampered"));

    const prisma = await prismaClient();
    const stored = await runWithTenant(owner, () =>
      prisma.mailboxCredential.findFirstOrThrow({
        where: { companyId, connectedAccountId },
        select: { sealedSecret: true },
      }),
    );

    expect(resolved).toEqual({ secret: "at-new", authMethod: "oauth" });
    expect(openMailboxTokenBundle(KEY, stored.sealedSecret)).toMatchObject({
      refreshToken: "rt-1",
      accessToken: "at-new",
    });
  });
});
