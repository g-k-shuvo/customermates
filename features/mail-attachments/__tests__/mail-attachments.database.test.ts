import type { ZodError } from "zod";
import type { StorageProvider } from "@/core/storage/storage-provider";

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
const { serializeInteractorFailure } = await import("@/core/validation/validation.utils");
const { CustomErrorCode } = await import("@/core/validation/validation.types");
const { StorageError, StorageFailure } = await import("@/core/storage/storage-provider");
const { PrismaMailAttachmentRepo } = await import("../prisma-mail-attachment.repository");
const { StoreMailAttachmentsService } = await import("../store/store-mail-attachments.service");
const { NULL_VIRUS_SCANNER } = await import("@/core/storage/virus-scanner");
const { StorageQuota } = await import("@/core/storage/storage-quota");
const { GetMailAttachmentInteractor } = await import("../get/get-mail-attachment.interactor");
const { SweepMailAttachmentsInteractor } = await import("../sweep/sweep-mail-attachments.interactor");
const { ForwardMailAttachmentsService } = await import("../forward/forward-mail-attachments.service");
const { PrismaMailboxRepo } = await import("@/features/mailbox/persistence/prisma-mailbox.repository");
const { toMessageDto } = await import("@/features/mailbox/get/mailbox-thread-mapper");

type Outcome = { ok: true; data: unknown } | { ok: false; error: ZodError };

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

const codes = (outcome: Outcome) =>
  outcome.ok ? [] : serializeInteractorFailure(outcome.error).issues.map((issue) => issue.customCode);

function memoryStorage(maxUploadBytes = 1024) {
  const objects = new Map<string, { body: Uint8Array; contentType: string }>();
  const provider: StorageProvider = {
    configured: true,
    maxUploadBytes,
    presignUpload: () => Promise.reject(new Error("unused")),
    presignDownload: () => Promise.reject(new Error("unused")),
    statObject: (key) => {
      const object = objects.get(key);
      return Promise.resolve(object ? { byteSize: object.body.byteLength, contentType: object.contentType } : null);
    },
    getObject: (key) => {
      const object = objects.get(key);
      if (!object) return Promise.reject(new StorageError(StorageFailure.notFound, key));

      return Promise.resolve({
        byteSize: object.body.byteLength,
        contentType: object.contentType,
        body: new Blob([Buffer.from(object.body)]).stream(),
      });
    },
    putObject: ({ key, body, contentType }) => {
      objects.set(key, { body: new Uint8Array(body), contentType });
      return Promise.resolve();
    },
    deleteObject: (key) => {
      objects.delete(key);
      return Promise.resolve();
    },
  };

  return { provider, objects };
}

const attachment = (fileName: string, contentType: string, text: string, contentId: string | null = null) => ({
  fileName,
  contentType,
  byteSize: Buffer.byteLength(text),
  contentId,
  inline: contentId !== null,
  content: Buffer.from(text),
});

describeDatabase("mail attachments", () => {
  const companyId = randomUUID();
  const connectedAccountId = randomUUID();
  let owner: string;
  let colleague: string;
  let threadId: string;
  let messageId: string;
  const storage = memoryStorage();

  beforeAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: companyId } });
      const role = await prisma.userRole.create({
        data: { companyId, name: `Admin ${randomUUID()}`, isSystemRole: true },
        select: { id: true },
      });
      const user = (name: string) =>
        prisma.user
          .create({
            data: {
              companyId,
              roleId: role.id,
              email: `${name}-${randomUUID()}@example.invalid`,
              firstName: name,
              lastName: "Tester",
              status: "active",
            },
            select: { id: true },
          })
          .then((row) => row.id);
      owner = await user("owner");
      colleague = await user("colleague");
      await prisma.connectedAccount.create({
        data: {
          id: connectedAccountId,
          companyId,
          userId: owner,
          unipileAccountId: `imap:${connectedAccountId}`,
          provider: "mail",
          status: "ok",
          hasMessaging: true,
          emailAddress: "owner@vendor.example",
        },
      });
      threadId = (
        await prisma.messagingThread.create({
          data: {
            companyId,
            connectedAccountId,
            provider: "mail",
            unipileThreadId: `thread-${randomUUID()}`,
            subject: "Quote",
          },
          select: { id: true },
        })
      ).id;
      messageId = (
        await prisma.messagingMessage.create({
          data: {
            companyId,
            messagingThreadId: threadId,
            connectedAccountId,
            unipileMessageId: "<quote-1@buyer.example>",
            provider: "mail",
            direction: "inbound",
            origin: "external",
            sender: { identifier: "anna@buyer.example" },
            bodyHtml: '<p>See the logo <img src="cid:logo@buyer"></p>',
            sentAt: new Date("2026-09-28T08:00:00Z"),
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

  const asOwner = <T>(fn: () => Promise<T>) => runAsBackgroundTenant(owner, fn);
  const asColleague = <T>(fn: () => Promise<T>) => runAsBackgroundTenant(colleague, fn);

  it("stores each attachment of a synced message and keeps the ones it cannot store as not kept", async () => {
    const stored = await asOwner(() =>
      new StoreMailAttachmentsService(
        new PrismaMailAttachmentRepo(),
        storage.provider,
        NULL_VIRUS_SCANNER,
        new StorageQuota({ usedBytesCompanyWide: () => Promise.resolve(0) }, null),
      ).store({ companyId, connectedAccountId, unipileMessageId: "<quote-1@buyer.example>" }, [
        attachment("Angebot.pdf", "application/pdf", "%PDF-1.4 quote"),
        attachment("logo.png", "image/png", "png-bytes", "logo@buyer"),
        attachment("page.html", "text/html", "<script>alert(1)</script>"),
        attachment("huge.zip", "application/zip", "x".repeat(2048)),
      ]),
    );

    expect(stored).toBe(3);
    const rows = await runWithoutTenant(() =>
      prisma.mailAttachment.findMany({ where: { companyId }, orderBy: { fileName: "asc" } }),
    );
    expect(rows.map((row) => [row.fileName, row.storageKey !== null, row.inline])).toEqual([
      ["Angebot.pdf", true, false],
      ["huge.zip", false, false],
      ["logo.png", true, true],
      ["page.html", true, false],
    ]);
    expect(rows.every((row) => row.messageId === messageId)).toBe(true);
    expect(rows.find((row) => row.fileName === "Angebot.pdf")?.storageKey).toMatch(
      new RegExp(`^${companyId}/mailAttachment/${messageId}/[0-9a-f-]{36}\\.pdf$`),
    );
  });

  it("shows inline images in the body and lists the rest on the message", async () => {
    const thread = await asOwner(() => new PrismaMailboxRepo().findThreadWithMessages(threadId));
    const message = thread?.messages[0];
    if (!message) throw new Error("thread missing");

    const dto = toMessageDto(message, false);
    const logo = message.attachments.find((row) => row.fileName === "logo.png");

    expect(dto.bodyHtml).toContain(`src="/api/mail-attachments/${logo?.id}"`);
    expect(dto.attachments.map((row) => [row.fileName, row.stored])).toEqual([
      ["Angebot.pdf", true],
      ["page.html", true],
      ["huge.zip", false],
    ]);
  });

  it("serves an attachment only to someone who can read the thread, and active content as a plain download", async () => {
    const rows = await runWithoutTenant(() => prisma.mailAttachment.findMany({ where: { companyId } }));
    const byName = (name: string) => rows.find((row) => row.fileName === name)?.id ?? "";
    const interactor = new GetMailAttachmentInteractor(new PrismaMailAttachmentRepo(), storage.provider);

    const pdf = await asOwner(() => interactor.invoke({ id: byName("Angebot.pdf") }));
    if (!pdf.ok) throw new Error("download failed");
    expect(pdf.data).toMatchObject({ contentType: "application/pdf", disposition: "inline", byteSize: 14 });
    expect(await new Response(pdf.data.body).text()).toBe("%PDF-1.4 quote");

    const html = await asOwner(() => interactor.invoke({ id: byName("page.html") }));
    expect(html).toMatchObject({
      ok: true,
      data: { contentType: "application/octet-stream", disposition: "attachment" },
    });

    const missing = (await asOwner(() => interactor.invoke({ id: byName("huge.zip") }))) as Outcome;
    expect(codes(missing)).toEqual([CustomErrorCode.mailAttachmentNotStored]);

    const hidden = (await asColleague(() => interactor.invoke({ id: byName("Angebot.pdf") }))) as Outcome;
    expect(codes(hidden)).toEqual([CustomErrorCode.mailAttachmentNotFound]);

    await runWithoutTenant(() =>
      prisma.messagingThread.update({ where: { id: threadId }, data: { sharedToCrm: true } }),
    );
    const shared = await asColleague(() => interactor.invoke({ id: byName("Angebot.pdf") }));
    expect(shared.ok).toBe(true);
  });

  it("forwards the chosen message's stored, non-inline attachments, and none of another message's", async () => {
    const loaded = await asOwner(() =>
      new ForwardMailAttachmentsService(new PrismaMailAttachmentRepo(), storage.provider).load(threadId, messageId),
    );
    const other = await asOwner(() =>
      new ForwardMailAttachmentsService(new PrismaMailAttachmentRepo(), storage.provider).load(threadId, randomUUID()),
    );
    expect(other).toEqual([]);

    expect(loaded.map((entry) => [entry.filename, entry.content.toString()])).toEqual(
      expect.arrayContaining([
        ["Angebot.pdf", "%PDF-1.4 quote"],
        ["page.html", "<script>alert(1)</script>"],
      ]),
    );
    expect(loaded).toHaveLength(2);
  });

  it("sweeps the attachments of a deleted message together with their objects", async () => {
    expect(storage.objects.size).toBe(3);

    await runWithoutTenant(() => prisma.messagingMessage.delete({ where: { id: messageId } }));
    const swept = await new SweepMailAttachmentsInteractor(new PrismaMailAttachmentRepo(), storage.provider).invoke();

    expect(swept).toEqual({ ok: true, data: { removed: 4 } });
    expect(storage.objects.size).toBe(0);
    expect(await runWithoutTenant(() => prisma.mailAttachment.count({ where: { companyId } }))).toBe(0);
  });
});
