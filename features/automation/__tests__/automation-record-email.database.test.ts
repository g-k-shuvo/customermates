import type { ReactElement } from "react";
import type { AppLocale } from "@/i18n/locale-registry";

import { randomUUID } from "node:crypto";

import { render } from "@react-email/render";
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
    EMAIL_TRANSPORT: "console",
  },
}));

const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runAsBackgroundTenant } = await import("@/core/decorators/background-tenant");
const { EntityType } = await import("@/generated/prisma");
const { SendEmailConfigSchema } = await import("@/features/automation/automation-action.schema");
const { MessagingAutomationEmailSender } = await import("@/features/automation/run/messaging-automation-email-sender");
const { GuardedEmailSender } = await import("@/features/messaging-send/guarded-email-sender");
const { MarkdownMessageSender } = await import("@/features/messaging-send/markdown-message-sender");
const { PrismaMessageDeliveryRepo } = await import("@/features/messaging-send/prisma-message-delivery.repository");
const { PrismaMergeValuesRepo } = await import("@/features/messaging-send/render/prisma-merge-values.repository");
const { PrismaMessageRecipientRepo } = await import(
  "@/features/messaging-send/recipients/prisma-message-recipient.repository"
);
const { PrismaSuppressionRepo } = await import("@/features/messaging-send/suppression/prisma-suppression.repository");
const { PrismaSenderIdentityRepo } = await import("@/features/messaging-send/sender/prisma-sender-identity.repository");
const { SenderResolver } = await import("@/features/messaging-send/sender/sender-resolver");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

type Delivered = { to: string; subject: string; react: ReactElement };

describeDatabase("automation email to the triggering record's people", () => {
  const companyId = randomUUID();
  const contactEmail = `anna-${randomUUID()}@buyer.example`;
  let actorId: string;
  let ownerEmail: string;
  let dealId: string;
  let bareDealId: string;
  let contactId: string;
  const delivered: Delivered[] = [];

  beforeAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: companyId } });
      const role = await prisma.userRole.create({
        data: { companyId, name: `Admin ${randomUUID()}`, isSystemRole: true },
        select: { id: true },
      });
      const user = (email: string, firstName: string, displayLanguage: AppLocale) =>
        prisma.user.create({
          data: { companyId, roleId: role.id, email, firstName, lastName: "Tester", status: "active", displayLanguage },
          select: { id: true, email: true },
        });
      actorId = (await user(`actor-${randomUUID()}@example.invalid`, "Max", "en")).id;
      const owner = await user(`owner-${randomUUID()}@example.invalid`, "Olga", "de");
      ownerEmail = owner.email;

      contactId = (
        await prisma.contact.create({
          data: {
            companyId,
            firstName: "Anna",
            lastName: "Weber",
            identifiers: { create: { companyId, provider: "mail", channelClass: "email", value: contactEmail } },
          },
          select: { id: true },
        })
      ).id;
      dealId = (
        await prisma.deal.create({
          data: {
            companyId,
            name: "Rollout",
            contacts: { create: { companyId, contactId } },
            users: { create: { companyId, userId: owner.id } },
          },
          select: { id: true },
        })
      ).id;
      bareDealId = (await prisma.deal.create({ data: { companyId, name: "Nobody" }, select: { id: true } })).id;
    });
  });

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: companyId } }));
    await prisma.$disconnect();
  });

  const sender = () =>
    new MessagingAutomationEmailSender(
      new MarkdownMessageSender(
        new GuardedEmailSender(
          new PrismaMessageDeliveryRepo(),
          {
            deliver: (message: Delivered) => {
              delivered.push(message);
              return Promise.resolve({ accepted: true, transport: "console", providerMessageId: null });
            },
          } as never,
          {
            suppressions: new PrismaSuppressionRepo(),
            tokens: new PrismaSuppressionRepo(),
            baseUrl: "https://crm.test",
          },
          new SenderResolver(new PrismaSenderIdentityRepo()),
        ),
      ),
      new PrismaMergeValuesRepo(),
      new PrismaMessageRecipientRepo(),
    );

  const send = (config: unknown, entityId: string | null = dealId) => {
    const parsed = SendEmailConfigSchema.parse(config);

    return runAsBackgroundTenant(actorId, () =>
      sender().send({
        ...parsed,
        runStepId: randomUUID(),
        record: entityId ? { entityType: EntityType.deal, entityId } : null,
      }),
    );
  };

  it("sends to the deal's contact with merge fields filled and escaped", async () => {
    await runWithoutTenant(() =>
      prisma.contact.update({ where: { id: contactId }, data: { lastName: "<b>Weber</b>" } }),
    );

    const outcome = await send({
      recipient: { kind: "recordContact" },
      subject: "Next steps for {{ deal.name }}",
      body: "Hi {{ contact.firstName }} {{ contact.lastName }},\n\nthe **proposal** is ready.",
    });

    expect(outcome).toEqual({ sent: true, to: contactEmail, duplicate: false });
    const message = delivered.at(-1);
    expect(message?.subject).toBe("Next steps for Rollout");
    const html = await render(message?.react as ReactElement);
    expect(html).toContain("Hi Anna &lt;b&gt;Weber&lt;/b&gt;,");
    expect(html).toContain("<strong>proposal</strong>");
    expect(html).toMatch(/<html[^>]*\blang="en"/);

    const row = await runWithoutTenant(() =>
      prisma.messageDelivery.findFirst({ where: { companyId, recipient: contactEmail }, select: { contactId: true } }),
    );
    expect(row?.contactId).toBe(contactId);
  });

  it("sends to the record's owner in the owner's language", async () => {
    const outcome = await send({
      recipient: { kind: "recordOwner" },
      subject: "Heads up",
      body: "Deal {{ deal.name }}",
    });

    expect(outcome).toEqual({ sent: true, to: ownerEmail, duplicate: false });
    expect(await render(delivered.at(-1)?.react as ReactElement)).toMatch(/<html[^>]*\blang="de"/);
  });

  it("keeps a stored literal address working", async () => {
    const outcome = await send({ to: "fixed@example.invalid", subject: "Static", body: "Plain text" }, null);

    expect(outcome).toEqual({ sent: true, to: "fixed@example.invalid", duplicate: false });
  });

  it("fails loudly when the record has nobody to send to or a merge field cannot be filled", async () => {
    const before = delivered.length;

    expect(await send({ recipient: { kind: "recordContact" }, subject: "Hi", body: "Hi" }, bareDealId)).toEqual({
      sent: false,
      code: "recipientMissing",
    });
    expect(await send({ recipient: { kind: "recordOwner" }, subject: "Hi", body: "Hi" }, bareDealId)).toEqual({
      sent: false,
      code: "recipientMissing",
    });
    expect(await send({ recipient: { kind: "recordOwner" }, subject: "Hi", body: "Hi" }, null)).toEqual({
      sent: false,
      code: "recipientMissing",
    });
    expect(
      await send(
        { recipient: { kind: "address", address: "fixed@example.invalid" }, subject: "Hi", body: "{{ deal.name }}" },
        null,
      ),
    ).toEqual({ sent: false, code: "mergeFieldUnresolved" });
    expect(delivered.length).toBe(before);
  });
});
