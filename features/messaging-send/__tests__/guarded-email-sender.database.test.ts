import type { EmailReceipt } from "@/features/email/email-transport";

import { randomUUID } from "node:crypto";
import { createElement } from "react";
import type { ReactElement } from "react";

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
const { PrismaMessageDeliveryRepo } = await import("../prisma-message-delivery.repository");
const { GuardedEmailSender, DELIVERY_REJECTED, DELIVERY_TRANSPORT_ERROR } = await import("../guarded-email-sender");
const { PrismaSuppressionRepo } = await import("../suppression/prisma-suppression.repository");
const { UnsubscribeInteractor } = await import("../suppression/unsubscribe.interactor");
const { PrismaSenderIdentityRepo } = await import("../sender/prisma-sender-identity.repository");
const { SenderResolver, SENDER_UNVERIFIED } = await import("../sender/sender-resolver");
const { ResetSenderIdentityInteractor, SaveSenderIdentityInteractor, VerifySenderDomainInteractor } = await import(
  "../sender/sender-identity.interactor"
);

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

const react = createElement("div", null, "Hello") as unknown as ReactElement<Record<string, unknown>>;

function emailService(results: Array<EmailReceipt | Error>) {
  const deliver = vi.fn(() => {
    const next = results.shift() ?? { accepted: true, transport: "console" as const, providerMessageId: null };
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });

  return { deliver, service: { deliver, send: vi.fn() } as never };
}

describeDatabase("guarded email sending", () => {
  const companyId = randomUUID();
  let userId: string;

  beforeAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: companyId } });
      const role = await prisma.userRole.create({
        data: { companyId, name: `Admin ${randomUUID()}`, isSystemRole: true },
        select: { id: true },
      });
      userId = (
        await prisma.user.create({
          data: {
            companyId,
            roleId: role.id,
            email: `owner-${randomUUID()}@example.invalid`,
            firstName: "Owner",
            lastName: "Tester",
            status: "active",
          },
          select: { id: true },
        })
      ).id;
    });
  });

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: companyId } }));
    await prisma.$disconnect();
  });

  const sender = (service: never) =>
    new GuardedEmailSender(
      new PrismaMessageDeliveryRepo(),
      service,
      {
        suppressions: new PrismaSuppressionRepo(),
        tokens: new PrismaSuppressionRepo(),
        baseUrl: "https://crm.example.test/",
      },
      new SenderResolver(new PrismaSenderIdentityRepo()),
    );

  const send = (service: never, runStepId: string, to = "Anna@Buyer.example", kind?: "marketing") =>
    runAsBackgroundTenant(userId, () =>
      sender(service).send({
        kind,
        source: "automation",
        sourceId: runStepId,
        automationRunStepId: runStepId,
        to,
        subject: "Your quote",
        render: () => react,
      }),
    );

  const deliveryOf = (id: string) =>
    runWithoutTenant(() => prisma.messageDelivery.findUniqueOrThrow({ where: { id } }));

  it("records the delivery before the transport and never sends one run step twice", async () => {
    const runStepId = randomUUID();
    const { deliver, service } = emailService([{ accepted: true, transport: "resend", providerMessageId: "re_123" }]);

    const first = await send(service, runStepId);
    const again = await send(service, runStepId, "anna@buyer.example");

    expect(first).toMatchObject({ status: "sent", providerMessageId: "re_123" });
    expect(again).toEqual({ status: "duplicate", deliveryId: first.status === "sent" ? first.deliveryId : "" });
    expect(deliver).toHaveBeenCalledTimes(1);
    if (first.status !== "sent") throw new Error("not sent");
    expect(await deliveryOf(first.deliveryId)).toMatchObject({
      status: "sent",
      transport: "resend",
      providerMessageId: "re_123",
      recipient: "anna@buyer.example",
      automationRunStepId: runStepId,
      attempts: 1,
    });
  });

  it("does not resend a delivery left in flight by a crash after the transport", async () => {
    const runStepId = randomUUID();
    const { deliver, service } = emailService([]);
    const first = await send(service, runStepId);
    if (first.status !== "sent") throw new Error("not sent");
    await runWithoutTenant(() =>
      prisma.messageDelivery.update({ where: { id: first.deliveryId }, data: { status: "sending" } }),
    );

    const retry = await send(service, runStepId);

    expect(retry).toEqual({ status: "duplicate", deliveryId: first.deliveryId });
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it("retries a delivery the provider rejected or that failed to reach it", async () => {
    const runStepId = randomUUID();
    const { deliver, service } = emailService([
      { accepted: false, transport: "resend", providerMessageId: null },
      new Error("socket closed"),
      { accepted: true, transport: "resend", providerMessageId: "re_ok" },
    ]);

    const rejected = await send(service, runStepId);
    const broken = await send(service, runStepId);
    const sent = await send(service, runStepId);

    expect(rejected).toMatchObject({ status: "failed", code: DELIVERY_REJECTED });
    expect(broken).toMatchObject({ status: "failed", code: DELIVERY_TRANSPORT_ERROR });
    expect(sent).toMatchObject({ status: "sent", providerMessageId: "re_ok" });
    expect(deliver).toHaveBeenCalledTimes(3);
    if (sent.status !== "sent") throw new Error("not sent");
    expect(await deliveryOf(sent.deliveryId)).toMatchObject({ status: "sent", attempts: 3, error: null });
  });

  it("claims a failed delivery only once when two retries race", async () => {
    const runStepId = randomUUID();
    const { service: failing } = emailService([{ accepted: false, transport: "resend", providerMessageId: null }]);
    await send(failing, runStepId);
    const { deliver, service } = emailService([]);

    const outcomes = await Promise.all([send(service, runStepId), send(service, runStepId)]);

    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(["duplicate", "sent"]);
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it("adds a one-click unsubscribe link to marketing mail and holds it back once the recipient unsubscribes", async () => {
    const renders: Array<string | null> = [];
    const { deliver, service } = emailService([]);
    const marketing = (sourceId: string) =>
      runAsBackgroundTenant(userId, () =>
        sender(service).send({
          kind: "marketing",
          source: "campaign",
          sourceId,
          to: "lead@prospect.example",
          subject: "Autumn offer",
          render: ({ unsubscribeUrl }) => {
            renders.push(unsubscribeUrl);
            return react;
          },
        }),
      );

    const first = await marketing(randomUUID());
    expect(first.status).toBe("sent");
    const headers = (deliver.mock.calls[0] as unknown as [{ headers: Record<string, string> }])[0].headers;
    const url = renders[0] ?? "";
    expect(url).toMatch(/^https:\/\/crm\.example\.test\/api\/unsubscribe\/[A-Za-z0-9_-]{40,}$/);
    expect(headers).toEqual({ "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });

    const token = url.split("/").pop() ?? "";
    const stored = await runWithoutTenant(() => prisma.unsubscribeToken.findMany({ where: { companyId } }));
    expect(stored.some((row) => row.tokenHash === token)).toBe(false);

    expect(await new UnsubscribeInteractor(new PrismaSuppressionRepo()).lookup({ token })).toEqual({
      status: "unsubscribed",
      address: "l***@prospect.example",
    });
    const unsubscribed = await new UnsubscribeInteractor(new PrismaSuppressionRepo()).invoke({ token });
    expect(unsubscribed).toEqual({ ok: true, data: { status: "unsubscribed", address: "l***@prospect.example" } });
    const again = await new UnsubscribeInteractor(new PrismaSuppressionRepo()).invoke({ token });
    expect(again.ok).toBe(true);
    expect(await new UnsubscribeInteractor(new PrismaSuppressionRepo()).lookup({ token })).toEqual({
      status: "alreadyUnsubscribed",
      address: "l***@prospect.example",
    });

    const held = await marketing(randomUUID());
    expect(held).toEqual({ status: "suppressed", reason: "unsubscribed" });
    expect(deliver).toHaveBeenCalledTimes(1);

    const transactional = await send(service, randomUUID(), "lead@prospect.example");
    expect(transactional.status).toBe("sent");
    expect((deliver.mock.calls[1] as unknown as [{ headers?: unknown }])[0].headers).toBeUndefined();
  });

  it("answers an unknown or malformed token without revealing anything", async () => {
    const interactor = new UnsubscribeInteractor(new PrismaSuppressionRepo());

    expect(await interactor.invoke({ token: "x".repeat(43) })).toEqual({ ok: true, data: { status: "unknown" } });
    expect(await interactor.lookup({ token: "../../etc" })).toEqual({ status: "unknown" });
  });

  it("sends as a verified company sender, refuses an unverified one and lets users on the domain send as themselves", async () => {
    const { deliver, service } = emailService([]);
    const records = new Map<string, string[][]>();
    const lookup = (name: string) => Promise.resolve(records.get(name) ?? []);
    const saved = await runAsBackgroundTenant(userId, () =>
      new SaveSenderIdentityInteractor(new PrismaSenderIdentityRepo()).invoke({
        fromName: "Acme Sales",
        fromAddress: "Sales@Acme.example",
        replyTo: "team@acme.example",
        allowUserSenders: true,
      }),
    );
    if (!saved.ok) throw new Error("save failed");
    expect(saved.data).toMatchObject({ verified: false, domain: "acme.example" });

    const refused = await send(service, randomUUID());
    expect(refused).toMatchObject({ status: "failed", code: SENDER_UNVERIFIED });
    expect(deliver).not.toHaveBeenCalled();

    const record = saved.data.verificationRecord;
    if (!record) throw new Error("no record");
    const unproven = await runAsBackgroundTenant(userId, () =>
      new VerifySenderDomainInteractor(new PrismaSenderIdentityRepo(), lookup).invoke({}),
    );
    expect(unproven.ok).toBe(false);

    records.set(record.name, [[record.value.slice(0, 10), record.value.slice(10)]]);
    const verified = await runAsBackgroundTenant(userId, () =>
      new VerifySenderDomainInteractor(new PrismaSenderIdentityRepo(), lookup).invoke({}),
    );
    expect(verified).toMatchObject({ ok: true, data: { verified: true } });

    await send(service, randomUUID());
    expect((deliver.mock.calls as unknown as unknown[][])[0]?.[0]).toMatchObject({
      from: '"Acme Sales" <sales@acme.example>',
      replyTo: "team@acme.example",
    });

    await runWithoutTenant(() =>
      prisma.user.update({ where: { id: userId }, data: { email: `owner-${randomUUID()}@acme.example` } }),
    );
    await runAsBackgroundTenant(userId, () =>
      sender(service).send({
        source: "manual",
        sourceId: randomUUID(),
        senderUserId: userId,
        to: "anna@buyer.example",
        subject: "Personal note",
        render: () => react,
      }),
    );
    expect((deliver.mock.calls as unknown as unknown[][])[1]?.[0]).toMatchObject({
      from: expect.stringMatching(/^"Owner Tester" <owner-.*@acme\.example>$/),
    });

    await runAsBackgroundTenant(userId, () =>
      new SaveSenderIdentityInteractor(new PrismaSenderIdentityRepo()).invoke({
        fromName: "Acme",
        fromAddress: "hello@other.example",
      }),
    );
    const moved = await send(service, randomUUID());
    expect(moved).toMatchObject({ status: "failed", code: SENDER_UNVERIFIED });

    const reset = await runAsBackgroundTenant(userId, () =>
      new ResetSenderIdentityInteractor(new PrismaSenderIdentityRepo()).invoke({}),
    );
    expect(reset).toMatchObject({ ok: true, data: { configured: false, fromAddress: "" } });

    const callsBefore = deliver.mock.calls.length;
    const restored = await send(service, randomUUID());
    expect(restored).not.toMatchObject({ code: SENDER_UNVERIFIED });
    expect(deliver.mock.calls.length).toBe(callsBefore + 1);
  });
});
