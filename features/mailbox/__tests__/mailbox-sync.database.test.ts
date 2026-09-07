import { randomUUID } from "node:crypto";

import nodemailer from "nodemailer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { runWithTenant } from "@/core/decorators/tenant-context";

import { parseSecretBoxKey, sealSecret } from "../credentials/secret-box";
import { createImapflowTransport } from "../sync/imapflow.transport";
import { PrismaMailboxRepo, type MailboxAccount } from "../persistence/prisma-mailbox.repository";
import { SyncMailboxService } from "../sync/sync-mailbox.service";
import { planThreadLinks } from "../link/thread-links";

const GREENMAIL_HOST = process.env.GREENMAIL_HOST ?? "127.0.0.1";
const GREENMAIL_SMTP_PORT = Number(process.env.GREENMAIL_SMTP_PORT ?? 3025);
const GREENMAIL_IMAP_PORT = Number(process.env.GREENMAIL_IMAP_PORT ?? 3143);

const enabled = Boolean(getLocalDatabaseTestUrl()) && process.env.RUN_MAILBOX_IMAP_TESTS === "true";
const describeMailbox = enabled ? describe : describe.skip;

const MAILBOX_ADDRESS = `owner-${randomUUID().slice(0, 8)}@vendor.example`;
const COUNTERPART = `anna-${randomUUID().slice(0, 8)}@buyer.example`;
const SECRET_KEY = parseSecretBoxKey(Buffer.alloc(32, 7).toString("base64"));

const companyId = randomUUID();
const connectedAccountId = randomUUID();
const contactId = randomUUID();

const tenantUser = createMockUser({ id: randomUUID(), companyId, email: MAILBOX_ADDRESS });

async function prismaClient() {
  const { prisma } = await import("@/prisma/db");

  return prisma;
}

async function deliver(subject: string, messageId: string, extraHeaders: Record<string, string> = {}) {
  const transporter = nodemailer.createTransport({
    host: GREENMAIL_HOST,
    port: GREENMAIL_SMTP_PORT,
    secure: false,
    tls: { rejectUnauthorized: false },
  });

  await transporter.sendMail({
    from: `Anna Weber <${COUNTERPART}>`,
    to: MAILBOX_ADDRESS,
    subject,
    text: `Body of ${subject}`,
    messageId,
    headers: extraHeaders,
  });
}

async function seedCompany() {
  const prisma = await prismaClient();

  await runWithTenant(tenantUser, async () => {
    await prisma.company.create({ data: { id: companyId, updatedAt: new Date() } });
  });
}

async function seedConnectedAccount() {
  const prisma = await prismaClient();

  await runWithTenant(tenantUser, async () => {
    await prisma.connectedAccount.create({
      data: {
        id: connectedAccountId,
        companyId,
        userId: tenantUser.id,
        unipileAccountId: `imap:${connectedAccountId}`,
        provider: "mail",
        status: "ok",
        hasMessaging: true,
        emailAddress: MAILBOX_ADDRESS,
        displayName: "Mailbox Owner",
      },
    });
  });
}

async function seedUserRow() {
  const prisma = await prismaClient();

  await runWithTenant(tenantUser, async () => {
    await prisma.user.create({
      data: {
        id: tenantUser.id,
        companyId,
        email: MAILBOX_ADDRESS,
        firstName: "Mailbox",
        lastName: "Owner",
      },
    });
  });
}

async function seedCredential() {
  const prisma = await prismaClient();

  await runWithTenant(tenantUser, async () => {
    await prisma.mailboxCredential.create({
      data: {
        companyId,
        connectedAccountId,
        imapHost: GREENMAIL_HOST,
        imapPort: GREENMAIL_IMAP_PORT,
        imapSecure: false,
        username: MAILBOX_ADDRESS,
        sealedSecret: sealSecret(SECRET_KEY, "any-password"),
      },
    });
  });
}

async function seedContact() {
  const prisma = await prismaClient();

  await runWithTenant(tenantUser, async () => {
    await prisma.contact.create({
      data: { id: contactId, companyId, firstName: "Anna", lastName: "Weber" },
    });

    await prisma.contactIdentifier.create({
      data: {
        companyId,
        contactId,
        provider: "mail",
        channelClass: "email",
        value: COUNTERPART,
      },
    });
  });
}

async function cleanup() {
  const prisma = await prismaClient();

  await runWithTenant(tenantUser, async () => {
    await prisma.company.delete({ where: { id: companyId } });
  });
}

function requireAccount(account: MailboxAccount | null): MailboxAccount {
  if (!account) throw new Error("mailbox account was not seeded");

  return account;
}

function syncService(repo: PrismaMailboxRepo) {
  const transport = createImapflowTransport(undefined, undefined, { allowPrivateHosts: true });

  return new SyncMailboxService(repo, transport, SECRET_KEY, () => new Date());
}

describeMailbox("mailbox sync against a real imap server", () => {
  beforeAll(async () => {
    await seedCompany();
    await seedUserRow();
    await seedConnectedAccount();
    await seedCredential();
    await seedContact();

    await deliver("Renewal quote", "<root-1@vendor.example>");
    await deliver("Re: Renewal quote", "<reply-2@buyer.example>", {
      "In-Reply-To": "<root-1@vendor.example>",
      References: "<root-1@vendor.example>",
    });
    await deliver("Unrelated invoice", "<other-3@buyer.example>");
  }, 120_000);

  afterAll(async () => {
    await cleanup();
  }, 60_000);

  it("stores the delivered mail as threaded conversations", async () => {
    const outcome = await runWithTenant(tenantUser, async () => {
      const repo = new PrismaMailboxRepo();
      const account = await repo.getMailboxAccount(connectedAccountId);
      expect(account).not.toBeNull();

      return await syncService(repo).syncFolder(requireAccount(account), "INBOX", 100);
    });

    expect(outcome.messagesStored).toBe(3);
    expect(outcome.threadsTouched).toBe(2);
    expect(outcome.cursor.uidNext).toBeGreaterThan(1);
  }, 120_000);

  it("groups the reply with the message it answers", async () => {
    const prisma = await prismaClient();

    const threads = await runWithTenant(tenantUser, async () =>
      prisma.messagingThread.findMany({
        where: { companyId, connectedAccountId },
        select: { subject: true, _count: { select: { messages: true } } },
        orderBy: { subject: "asc" },
      }),
    );

    const counts = threads.map((thread) => thread._count.messages).sort((left, right) => right - left);
    expect(counts).toEqual([2, 1]);
  }, 60_000);

  it("records the counterpart as a thread participant", async () => {
    const prisma = await prismaClient();

    const participants = await runWithTenant(tenantUser, async () =>
      prisma.messagingThreadParticipant.findMany({ where: { companyId }, select: { identifier: true, isSelf: true } }),
    );

    const identifiers = participants.map((participant) => participant.identifier);
    expect(identifiers).toContain(COUNTERPART.toLowerCase());
    expect(identifiers).toContain(MAILBOX_ADDRESS.toLowerCase());
  }, 60_000);

  it("re-running the sync stores nothing further", async () => {
    const outcome = await runWithTenant(tenantUser, async () => {
      const repo = new PrismaMailboxRepo();
      const account = await repo.getMailboxAccount(connectedAccountId);

      return await syncService(repo).syncFolder(requireAccount(account), "INBOX", 100);
    });

    expect(outcome.messagesStored).toBe(0);

    const prisma = await prismaClient();
    const total = await runWithTenant(tenantUser, async () => prisma.messagingMessage.count({ where: { companyId } }));

    expect(total).toBe(3);
  }, 120_000);

  it("resyncs the folder from the start when the cursor is discarded", async () => {
    const prisma = await prismaClient();

    await runWithTenant(tenantUser, async () => {
      await prisma.mailboxCredential.updateMany({
        where: { connectedAccountId, companyId },
        data: { syncCursors: [] },
      });
    });

    const outcome = await runWithTenant(tenantUser, async () => {
      const repo = new PrismaMailboxRepo();
      const account = await repo.getMailboxAccount(connectedAccountId);

      return await syncService(repo).syncFolder(requireAccount(account), "INBOX", 100);
    });

    expect(outcome.messagesStored).toBe(0);

    const total = await runWithTenant(tenantUser, async () => prisma.messagingMessage.count({ where: { companyId } }));

    expect(total).toBe(3);
  }, 120_000);

  it("links a synced thread to the contact behind the counterpart address", async () => {
    const linked = await runWithTenant(tenantUser, async () => {
      const repo = new PrismaMailboxRepo();
      const matches = await repo.findContactMatches([COUNTERPART.toLowerCase()]);
      const deals = await repo.findDealCandidates(matches.map((match) => match.contactId));

      return planThreadLinks(
        [
          { identifier: MAILBOX_ADDRESS.toLowerCase(), isSelf: true },
          { identifier: COUNTERPART.toLowerCase(), isSelf: false },
        ],
        matches,
        deals,
      );
    });

    expect(linked.contactIds).toEqual([contactId]);
    expect(linked.dealId).toBeNull();
  }, 60_000);

  it("finds the stored threads by the contact's email identifier", async () => {
    const threads = await runWithTenant(tenantUser, async () => {
      const repo = new PrismaMailboxRepo();
      const identifiers = await repo.findEmailIdentifiersOfContacts([contactId]);

      return await repo.findThreadsForIdentifiers(identifiers, false);
    });

    expect(threads.length).toBe(2);
    expect(threads[0].lastMessageAt).not.toBeNull();
  }, 60_000);
});
