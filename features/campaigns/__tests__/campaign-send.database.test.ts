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
    EMAIL_TRANSPORT: "console",
  },
}));

const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runAsBackgroundTenant } = await import("@/core/decorators/background-tenant");
const { CampaignRecipientStatus, CampaignStatus, MessageDeliveryStatus } = await import("@/generated/prisma");
const { BackgroundTaskService } = await import("@/core/utils/background-task.service");
const { EmailService } = await import("@/features/email/email.service");
const di = await import("@/core/di");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("sending a campaign", () => {
  const companyId = randomUUID();
  let userId: string;
  let listId: string;
  const dispatched: Array<{ id: string; payload: unknown }> = [];
  const delivered: Array<{ to: string; subject: string; headers?: Record<string, string> }> = [];

  beforeAll(async () => {
    vi.spyOn(BackgroundTaskService.prototype, "dispatch").mockImplementation((id: string, payload: unknown) => {
      dispatched.push({ id, payload });
      return Promise.resolve();
    });
    vi.spyOn(EmailService.prototype, "deliver").mockImplementation((message) => {
      delivered.push({ to: message.to, subject: message.subject, headers: message.headers });
      return Promise.resolve({ accepted: true, transport: "console", providerMessageId: null });
    });

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
            firstName: "Max",
            lastName: "Sender",
            status: "active",
          },
          select: { id: true },
        })
      ).id;
      listId = (await prisma.contactList.create({ data: { companyId, name: "Targets" }, select: { id: true } })).id;
      for (let index = 0; index < 30; index += 1) {
        const contact = await prisma.contact.create({
          data: {
            companyId,
            firstName: `Reader${index}`,
            lastName: "Test",
            identifiers:
              index === 29
                ? undefined
                : {
                    create: {
                      companyId,
                      provider: "mail",
                      channelClass: "email",
                      value: `reader${index}@campaign.example`,
                    },
                  },
          },
          select: { id: true },
        });
        await prisma.contactListMember.create({ data: { companyId, listId, contactId: contact.id } });
      }
      await prisma.messageSuppression.create({
        data: { companyId, address: "reader3@campaign.example", reason: "unsubscribed" },
      });
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: companyId } }));
    await prisma.$disconnect();
  });

  const as = <T>(fn: () => Promise<T>) => runAsBackgroundTenant(userId, fn);

  async function materialize(campaignId: string) {
    const job = await runWithoutTenant(() =>
      prisma.bulkJob.findFirst({ where: { companyId, subjectId: campaignId }, select: { id: true } }),
    );
    if (!job) throw new Error("no job");
    let cursor: string | null = null;
    do {
      const page = await as(() => di.getRunBulkJobPageInteractor().invoke({ jobId: job.id, cursor }));
      if (!page.ok) throw new Error("page failed");
      cursor = page.data.nextCursor;
    } while (cursor !== null);
    await as(() => di.getFinishBulkJobInteractor().invoke({ id: job.id }));
  }

  it("refuses to send without a lawful basis, then resolves, sends in chunks and skips the suppressed address", async () => {
    const draft = await as(() =>
      di.getCreateCampaignInteractor().invoke({
        name: "Whitepaper",
        subject: "A new whitepaper for {{ contact.firstName }}",
        bodyMarkdown: "Hi {{ contact.firstName }},\n\nour **whitepaper** is out.",
        audience: { conditions: [{ kind: "onList", listId }] },
      }),
    );
    if (!draft.ok) throw new Error("no draft");

    expect((await as(() => di.getStartCampaignInteractor().invoke({ id: draft.data.id }))).ok).toBe(false);

    await as(() =>
      di.getUpdateCampaignInteractor().invoke({
        id: draft.data.id,
        name: "Whitepaper",
        subject: draft.data.subject,
        bodyMarkdown: draft.data.bodyMarkdown,
        audience: draft.data.audience,
        lawfulBasis: "Documented opt-in at the 2026 conference",
      }),
    );
    const started = await as(() => di.getStartCampaignInteractor().invoke({ id: draft.data.id }));
    expect(started.ok && started.data.status).toBe(CampaignStatus.sending);
    expect((await as(() => di.getDeleteCampaignInteractor().invoke({ id: draft.data.id }))).ok).toBe(false);

    await materialize(draft.data.id);
    expect(dispatched.at(-1)).toEqual({ id: "send-campaign", payload: { campaignId: draft.data.id } });

    const first = await as(() => di.getSendCampaignChunkInteractor().invoke({ id: draft.data.id }));
    expect(first).toEqual({ ok: true, data: { remaining: 4 } });
    const second = await as(() => di.getSendCampaignChunkInteractor().invoke({ id: draft.data.id }));
    expect(second).toEqual({ ok: true, data: { remaining: 0 } });
    await as(() => di.getFinishCampaignInteractor().invoke({ id: draft.data.id }));

    const campaign = await as(() => di.getGetCampaignInteractor().invoke({ id: draft.data.id }));
    expect(campaign.ok && campaign.data).toMatchObject({
      status: CampaignStatus.sent,
      sentCount: 28,
      suppressedCount: 1,
      failedCount: 0,
      pendingCount: 0,
    });
    expect(delivered).toHaveLength(28);
    expect(delivered.map((message) => message.to)).not.toContain("reader3@campaign.example");
    expect(delivered.find((message) => message.to === "reader7@campaign.example")?.subject).toBe(
      "A new whitepaper for Reader7",
    );
    expect(delivered[0].headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");

    const all = await as(() => di.getGetCampaignsInteractor().invoke());
    expect(all.ok && all.data.find((row) => row.id === draft.data.id)?.sentCount).toBe(28);

    const recipients = await as(() => di.getGetCampaignRecipientsInteractor().invoke({ id: draft.data.id }));
    expect(recipients.ok && recipients.data.total).toBe(29);
  });

  it("never sends a recipient twice when a chunk is replayed", async () => {
    const campaign = await runWithoutTenant(() =>
      prisma.campaign.findFirst({ where: { companyId, name: "Whitepaper" }, select: { id: true } }),
    );
    if (!campaign) throw new Error("no campaign");
    const before = delivered.length;

    await runWithoutTenant(async () => {
      await prisma.campaign.updateMany({ where: { id: campaign.id }, data: { status: CampaignStatus.sending } });
      await prisma.campaignRecipient.updateMany({
        where: { campaignId: campaign.id, status: CampaignRecipientStatus.sent },
        data: { status: CampaignRecipientStatus.pending },
      });
    });
    let remaining = 1;
    while (remaining > 0) {
      const outcome = await as(() => di.getSendCampaignChunkInteractor().invoke({ id: campaign.id }));
      remaining = outcome.ok ? outcome.data.remaining : 0;
    }

    expect(delivered.length).toBe(before);
    const deliveries = await runWithoutTenant(() =>
      prisma.messageDelivery.count({
        where: { companyId, campaignId: campaign.id, status: MessageDeliveryStatus.sent },
      }),
    );
    expect(deliveries).toBe(28);
  });

  it("cancels a sending campaign and skips everyone not reached", async () => {
    const draft = await as(() =>
      di.getCreateCampaignInteractor().invoke({
        name: "Second wave",
        subject: "Second",
        bodyMarkdown: "Hello",
        audience: { conditions: [{ kind: "onList", listId }] },
        lawfulBasis: "Consent",
      }),
    );
    if (!draft.ok) throw new Error("no draft");
    await as(() => di.getStartCampaignInteractor().invoke({ id: draft.data.id }));
    await materialize(draft.data.id);

    const cancelled = await as(() => di.getCancelCampaignInteractor().invoke({ id: draft.data.id }));
    expect(cancelled.ok && cancelled.data).toMatchObject({
      status: CampaignStatus.cancelled,
      pendingCount: 0,
      skippedCount: 29,
    });
    expect(await as(() => di.getSendCampaignChunkInteractor().invoke({ id: draft.data.id }))).toEqual({
      ok: true,
      data: { remaining: 0 },
    });
    const skipped = await runWithoutTenant(() =>
      prisma.campaignRecipient.count({ where: { campaignId: draft.data.id, status: CampaignRecipientStatus.skipped } }),
    );
    expect(skipped).toBe(29);
  });
  it("blanks recipient addresses once a finished campaign passes its retention period", async () => {
    const campaign = await runWithoutTenant(() =>
      prisma.campaign.findFirst({ where: { companyId, name: "Whitepaper" }, select: { id: true } }),
    );
    if (!campaign) throw new Error("no campaign");
    await runWithoutTenant(() =>
      prisma.campaign.updateMany({
        where: { id: campaign.id },
        data: { finishedAt: new Date("2020-01-01T00:00:00Z") },
      }),
    );
    const before = await runWithoutTenant(() =>
      prisma.campaign.findUnique({ where: { id: campaign.id }, select: { sentCount: true } }),
    );

    const outcome = await di.getRedactCampaignRecipientsInteractor().invoke();
    expect(outcome.ok && outcome.data.redacted).toBeGreaterThanOrEqual(29);

    const left = await runWithoutTenant(() =>
      prisma.campaignRecipient.count({ where: { campaignId: campaign.id, email: { not: "" } } }),
    );
    const deliveries = await runWithoutTenant(() =>
      prisma.messageDelivery.count({ where: { campaignId: campaign.id, recipient: { not: "" } } }),
    );
    expect({ left, deliveries }).toEqual({ left: 0, deliveries: 0 });
    const counts = await runWithoutTenant(() =>
      prisma.campaign.findUnique({ where: { id: campaign.id }, select: { sentCount: true } }),
    );
    expect(counts?.sentCount).toBe(before?.sentCount);
    const suppression = await runWithoutTenant(() => prisma.messageSuppression.count({ where: { companyId } }));
    expect(suppression).toBe(1);
  });
});
