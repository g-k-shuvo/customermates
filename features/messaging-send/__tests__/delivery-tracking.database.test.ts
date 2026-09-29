import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

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
const { MessageDeliveryEventKind, MessageDeliveryStatus, MessageKind } = await import("@/generated/prisma");
const { PrismaDeliveryTrackingRepo } = await import("../tracking/prisma-delivery-tracking.repository");
const { HandleDeliveryEventInteractor } = await import("../tracking/handle-delivery-event.interactor");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("delivery events from the provider", () => {
  const companyId = randomUUID();
  const interactor = new HandleDeliveryEventInteractor(new PrismaDeliveryTrackingRepo());

  beforeAll(() => runWithoutTenant(() => prisma.company.create({ data: { id: companyId } })));

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: companyId } }));
    await prisma.$disconnect();
  });

  const delivery = async (recipient: string) => {
    const providerMessageId = `re_${randomUUID()}`;
    const row = await runWithoutTenant(() =>
      prisma.messageDelivery.create({
        data: {
          companyId,
          kind: MessageKind.marketing,
          status: MessageDeliveryStatus.sent,
          source: "campaign",
          dedupeKey: randomUUID(),
          idempotencyKey: randomUUID(),
          recipient,
          subject: "Hello",
          transport: "resend",
          providerMessageId,
        },
        select: { id: true },
      }),
    );

    return { id: row.id, providerMessageId };
  };

  const event = (
    providerMessageId: string,
    kind: (typeof MessageDeliveryEventKind)[keyof typeof MessageDeliveryEventKind],
    suppresses = false,
    occurredAt = new Date("2026-09-28T10:00:00Z"),
  ) =>
    runWithoutTenant(() =>
      interactor.invoke({
        kind,
        providerMessageId,
        occurredAt,
        providerEventId: randomUUID(),
        detail: null,
        suppresses,
      }),
    );

  const state = (id: string, recipient: string) =>
    runWithoutTenant(async () => ({
      status: (await prisma.messageDelivery.findUnique({ where: { id }, select: { status: true } }))?.status,
      events: await prisma.messageDeliveryEvent.count({ where: { deliveryId: id } }),
      suppression: await prisma.messageSuppression.findFirst({
        where: { companyId, address: recipient },
        select: { reason: true, deliveryId: true },
      }),
    }));

  it("marks a delivery delivered and records a replayed event once", async () => {
    const sent = await delivery("delivered@example.invalid");

    expect(await event(sent.providerMessageId, MessageDeliveryEventKind.delivered)).toEqual({
      ok: true,
      data: { handled: true, duplicate: false },
    });
    expect(await event(sent.providerMessageId, MessageDeliveryEventKind.delivered)).toEqual({
      ok: true,
      data: { handled: true, duplicate: true },
    });
    expect(await state(sent.id, "delivered@example.invalid")).toEqual({
      status: MessageDeliveryStatus.delivered,
      events: 1,
      suppression: null,
    });
  });

  it("suppresses the address after a hard bounce, but not after a soft one", async () => {
    const soft = await delivery("soft@example.invalid");
    await event(soft.providerMessageId, MessageDeliveryEventKind.bounced, false);
    expect(await state(soft.id, "soft@example.invalid")).toEqual({
      status: MessageDeliveryStatus.sent,
      events: 1,
      suppression: null,
    });

    const hard = await delivery("hard@example.invalid");
    await event(hard.providerMessageId, MessageDeliveryEventKind.delivered);
    await event(hard.providerMessageId, MessageDeliveryEventKind.bounced, true, new Date("2026-09-28T10:05:00Z"));
    expect(await state(hard.id, "hard@example.invalid")).toEqual({
      status: MessageDeliveryStatus.bounced,
      events: 2,
      suppression: { reason: "bounced", deliveryId: hard.id },
    });
  });

  it("suppresses a complaint and never downgrades it to delivered", async () => {
    const sent = await delivery("complaint@example.invalid");

    await event(sent.providerMessageId, MessageDeliveryEventKind.complained, true);
    await event(sent.providerMessageId, MessageDeliveryEventKind.delivered, false, new Date("2026-09-28T10:10:00Z"));

    expect(await state(sent.id, "complaint@example.invalid")).toEqual({
      status: MessageDeliveryStatus.complained,
      events: 2,
      suppression: { reason: "complained", deliveryId: sent.id },
    });
  });

  it("ignores an event for a message it did not send", async () => {
    expect(await event("re_unknown", MessageDeliveryEventKind.bounced, true)).toEqual({
      ok: true,
      data: { handled: false, duplicate: false },
    });
  });
});
