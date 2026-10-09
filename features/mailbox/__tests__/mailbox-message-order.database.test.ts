import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

vi.mock("@/env", () => ({
  env: { APP_MODE: "self-hosted", DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: "test" },
}));

const { prisma } = await import("@/prisma/db");
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { PrismaMailboxRepo } = await import("../persistence/prisma-mailbox.repository");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("messages that share a timestamp keep their arrival order", () => {
  const companyId = randomUUID();
  const ownerId = randomUUID();
  const threadId = randomUUID();
  const firstId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  const secondId = "00000000-0000-4000-8000-000000000001";
  const sentAt = new Date("2026-10-08T10:06:52Z");
  const owner = createMockUser({ id: ownerId, companyId });

  beforeAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: companyId } });
      const role = await prisma.userRole.create({ data: { companyId, name: `Mail ${randomUUID()}` } });
      await prisma.user.create({
        data: {
          id: ownerId,
          companyId,
          roleId: role.id,
          firstName: "Owner",
          lastName: "Tester",
          email: `owner-${ownerId}@example.invalid`,
          status: "active",
        },
      });
      const account = await prisma.connectedAccount.create({
        data: {
          companyId,
          userId: ownerId,
          unipileAccountId: `imap:${randomUUID()}`,
          provider: "mail",
          status: "ok",
          hasMessaging: true,
          emailAddress: "owner@seller.example",
        },
      });
      await prisma.messagingThread.create({
        data: {
          id: threadId,
          companyId,
          connectedAccountId: account.id,
          unipileThreadId: "imap:thread:first@buyer.example",
          provider: "mail",
          subject: "Follow-up",
          lastMessageAt: sentAt,
        },
      });

      for (const [id, messageId, text, createdAt] of [
        [firstId, "first@buyer.example", "First message", new Date("2026-10-08T10:07:00.000Z")],
        [secondId, "second@buyer.example", "Second message", new Date("2026-10-08T10:07:00.050Z")],
      ] as const) {
        await prisma.messagingMessage.create({
          data: {
            id,
            companyId,
            messagingThreadId: threadId,
            connectedAccountId: account.id,
            unipileMessageId: `imap:msg:id:${messageId}`,
            provider: "mail",
            direction: "inbound",
            origin: "external",
            sender: { identifier: "anna@buyer.example", displayName: "Anna" },
            senderIdentifier: "anna@buyer.example",
            recipients: { to: [{ identifier: "owner@seller.example" }], cc: [] },
            subject: "Follow-up",
            bodyText: text,
            sentAt,
            createdAt,
          },
        });
      }
    });
  });

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: companyId } }));
    await prisma.$disconnect();
  });

  it("shows the conversation in the order the messages arrived", async () => {
    const thread = await runWithTenant(owner, () => new PrismaMailboxRepo().findThreadWithMessages(threadId));

    expect(thread?.messages.map((message) => message.bodyText)).toEqual(["First message", "Second message"]);
  });

  it("treats the message that arrived last as the latest one", async () => {
    const latest = await runWithTenant(owner, () => new PrismaMailboxRepo().findForwardSourceMessage(threadId, null));

    expect(latest?.bodyText).toBe("Second message");
  });
});
