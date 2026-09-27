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
const { interactorFailureKind, serializeInteractorFailure } = await import("@/core/validation/validation.utils");
const { CustomErrorCode } = await import("@/core/validation/validation.types");
const { Action, Resource } = await import("@/generated/prisma");
const { getGetRecordThreadsInteractor } = await import("@/core/di");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("conversations shown on a contact follow the caller's access to that contact", () => {
  const companyId = randomUUID();
  const viewerId = randomUUID();
  const mailboxOwnerId = randomUUID();
  const assignedContactId = randomUUID();
  const hiddenContactId = randomUUID();
  const assignedThreadId = randomUUID();
  const hiddenThreadId = randomUUID();

  beforeAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: companyId } });
      const role = await prisma.userRole.create({
        data: {
          companyId,
          name: `Own contacts ${randomUUID()}`,
          permissions: {
            create: [
              { companyId, resource: Resource.inboxMessages, action: Action.readOwn },
              { companyId, resource: Resource.contacts, action: Action.readOwn },
            ],
          },
        },
        select: { id: true },
      });
      await prisma.user.createMany({
        data: [
          { id: viewerId, roleId: role.id, firstName: "Viewer" },
          { id: mailboxOwnerId, roleId: role.id, firstName: "Mailbox" },
        ].map((user) => ({
          ...user,
          companyId,
          email: `${user.firstName.toLowerCase()}-${user.id}@example.invalid`,
          lastName: "Tester",
          status: "active" as const,
        })),
      });
      await prisma.contact.createMany({
        data: [
          { id: assignedContactId, companyId, firstName: "Assigned", lastName: "Buyer" },
          { id: hiddenContactId, companyId, firstName: "Hidden", lastName: "Buyer" },
        ],
      });
      await prisma.contactUser.create({ data: { companyId, contactId: assignedContactId, userId: viewerId } });
      await prisma.contactIdentifier.createMany({
        data: [
          {
            companyId,
            contactId: assignedContactId,
            provider: "mail",
            channelClass: "email",
            value: "assigned@buyer.example",
          },
          {
            companyId,
            contactId: hiddenContactId,
            provider: "mail",
            channelClass: "email",
            value: "hidden@buyer.example",
          },
        ],
      });
      const account = await prisma.connectedAccount.create({
        data: {
          companyId,
          userId: mailboxOwnerId,
          unipileAccountId: `imap:${randomUUID()}`,
          provider: "mail",
          status: "ok",
          hasMessaging: true,
          emailAddress: "owner@seller.example",
        },
        select: { id: true },
      });

      for (const [threadId, identifier] of [
        [assignedThreadId, "assigned@buyer.example"],
        [hiddenThreadId, "hidden@buyer.example"],
      ] as const) {
        await prisma.messagingThread.create({
          data: {
            id: threadId,
            companyId,
            connectedAccountId: account.id,
            unipileThreadId: `thread-${threadId}`,
            provider: "mail",
            subject: `About ${identifier}`,
            lastMessageAt: new Date("2026-09-20T10:00:00Z"),
            sharedToCrm: true,
            participants: {
              create: [
                { companyId, provider: "mail", providerUserId: identifier, identifier, displayName: identifier },
              ],
            },
          },
        });
      }
    });
  });

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: companyId } }));
    await prisma.$disconnect();
  });

  it("returns the shared conversations of a contact assigned to the caller", async () => {
    const result = await runAsBackgroundTenant(viewerId, () =>
      getGetRecordThreadsInteractor().invoke({ contactId: assignedContactId }),
    );

    expect(result.ok && result.data.map((thread) => thread.id)).toEqual([assignedThreadId]);
  });

  it("answers not found for a contact the caller cannot read, without revealing its conversations", async () => {
    const result = await runAsBackgroundTenant(viewerId, () =>
      getGetRecordThreadsInteractor().invoke({ contactId: hiddenContactId }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(interactorFailureKind(result.error)).toBe("not_found");
    expect(serializeInteractorFailure(result.error).issues).toEqual([
      expect.objectContaining({ path: ["contactId"], customCode: CustomErrorCode.contactNotFound }),
    ]);
  });
});
