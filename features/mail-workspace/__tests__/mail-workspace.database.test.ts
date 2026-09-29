import { randomUUID } from "node:crypto";

import { createTranslator } from "next-intl";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import messages from "@/i18n/locales/en.json";

vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: (namespace?: string) =>
    Promise.resolve(createTranslator({ locale: "en", messages, namespace: namespace as never })),
}));

import { createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { Action, Resource } from "@/generated/prisma";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { PrismaMailboxRepo } from "@/features/mailbox/persistence/prisma-mailbox.repository";

import { PrismaMailWorkspaceRepo } from "../prisma-mail-workspace.repository";
import { GetMailDraftInteractor, SaveMailDraftInteractor } from "../drafts/mail-draft.interactor";
import {
  CancelOutboxMessageInteractor,
  GetMailOutboxInteractor,
  ScheduleMailInteractor,
  SendOutboxMessageNowInteractor,
} from "../outbox/mail-outbox.interactor";
import { SendDueOutboxInteractor } from "../outbox/send-due-outbox.interactor";
import { SetThreadArchivedInteractor, SetThreadFollowUpInteractor } from "../threads/mail-thread-state.interactor";
import { SetThreadLabelsInteractor, UpsertMailLabelInteractor } from "../labels/mail-label.interactor";

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

const PERMISSIONS = [
  { resource: Resource.inboxMessages, action: Action.create },
  { resource: Resource.inboxMessages, action: Action.readOwn },
];

const companyId = randomUUID();
const otherCompanyId = randomUUID();
const owner = {
  ...createMockUserWithPermissions(PERMISSIONS),
  id: randomUUID(),
  companyId,
  email: `o-${randomUUID()}@x.test`,
};
const colleague = {
  ...createMockUserWithPermissions(PERMISSIONS),
  id: randomUUID(),
  companyId,
  email: `c-${randomUUID()}@x.test`,
};
const stranger = {
  ...createMockUserWithPermissions(PERMISSIONS),
  id: randomUUID(),
  companyId: otherCompanyId,
  email: `s-${randomUUID()}@x.test`,
};
const accountId = randomUUID();
const threadId = randomUUID();
const secondThreadId = randomUUID();
const NOW = new Date("2026-10-01T09:00:00Z");

type Issue = { params?: { error?: CustomErrorCode } };

function codeOf(result: { ok: boolean; error?: { issues: unknown[] } }): CustomErrorCode | undefined {
  return result.ok ? undefined : (result.error?.issues[0] as Issue | undefined)?.params?.error;
}

async function prismaClient() {
  const { prisma } = await import("@/prisma/db");

  return prisma;
}

const repo = () => new PrismaMailWorkspaceRepo();
const compose = <T extends object>(fields: T) => ({
  mode: "reply" as const,
  replyAll: false,
  recipients: [] as string[],
  ...fields,
});
const asOwner = <T>(work: () => Promise<T>) => runWithTenant(owner, work);

async function listView(view: "inbox" | "archived" | "drafts" | "outbox" | "followUp", labelId: string | null = null) {
  const rows = await asOwner(() =>
    new PrismaMailboxRepo().listThreadsForMailboxes(50, { search: null, folder: null, view, labelId }),
  );

  return rows.map((row) => row.id).sort();
}

describeDatabase("mail workspace", () => {
  beforeAll(async () => {
    const prisma = await prismaClient();

    await runWithTenant(owner, async () => {
      await prisma.company.create({ data: { id: companyId, updatedAt: new Date() } });
      for (const user of [owner, colleague]) {
        await prisma.user.create({
          data: { id: user.id, companyId, email: user.email, firstName: "T", lastName: "U" },
        });
      }
      await prisma.connectedAccount.create({
        data: {
          id: accountId,
          companyId,
          userId: owner.id,
          unipileAccountId: `imap:${accountId}`,
          provider: "mail",
          status: "ok",
          hasMessaging: true,
          emailAddress: owner.email,
        },
      });
      await prisma.mailboxCredential.create({
        data: {
          companyId,
          connectedAccountId: accountId,
          imapHost: "imap.example.test",
          imapPort: 993,
          username: owner.email,
          sealedSecret: "sealed",
          smtpHost: "smtp.example.test",
          smtpPort: 465,
        },
      });
      for (const [id, subject] of [
        [threadId, "Renewal"],
        [secondThreadId, "Invoice"],
      ]) {
        await prisma.messagingThread.create({
          data: {
            id,
            companyId,
            connectedAccountId: accountId,
            unipileThreadId: `thread:${id}`,
            provider: "mail",
            subject,
            lastMessageAt: new Date("2026-09-30T10:00:00Z"),
          },
        });
      }
    });
    await runWithTenant(stranger, async () => {
      await prisma.company.create({ data: { id: otherCompanyId, updatedAt: new Date() } });
    });
  }, 60_000);

  afterAll(async () => {
    const prisma = await prismaClient();

    await runWithTenant(owner, () => prisma.company.delete({ where: { id: companyId } }));
    await runWithTenant(stranger, () => prisma.company.delete({ where: { id: otherCompanyId } }));
  }, 60_000);

  it("saves one draft per thread, updates it, and drops it once emptied", async () => {
    const save = (body: string) =>
      asOwner(() => new SaveMailDraftInteractor(repo()).invoke(compose({ threadId, body, replyAll: true })));

    await save("First words");
    const updated = await save("Second words");
    const loaded = await asOwner(() => new GetMailDraftInteractor(repo()).invoke({ threadId }));

    expect(updated.ok && updated.data.draft?.body).toBe("Second words");
    expect(loaded.ok && loaded.data.draft).toMatchObject({ body: "Second words", replyAll: true, mode: "reply" });
    expect(await listView("drafts")).toEqual([threadId]);

    const colleagueSave = await runWithTenant(colleague, () =>
      new SaveMailDraftInteractor(repo()).invoke(compose({ threadId, body: "Not mine" })),
    );
    expect(codeOf(colleagueSave)).toBe(CustomErrorCode.mailboxThreadNotFound);

    await save("   ");
    expect(await listView("drafts")).toEqual([]);
  });

  it("schedules a reply, lists it in the outbox and clears the draft it came from", async () => {
    const schedule = new ScheduleMailInteractor(repo(), () => NOW);
    await asOwner(() => new SaveMailDraftInteractor(repo()).invoke(compose({ threadId, body: "Later please" })));

    const empty = await asOwner(() =>
      schedule.invoke(compose({ threadId, body: " ", sendAt: new Date("2026-10-01T10:00:00Z") })),
    );
    const past = await asOwner(() =>
      schedule.invoke(compose({ threadId, body: "x", sendAt: new Date("2026-10-01T08:00:00Z") })),
    );
    const scheduled = await asOwner(() =>
      schedule.invoke(compose({ threadId, body: "Later please", sendAt: new Date("2026-10-01T10:00:00Z") })),
    );

    expect(codeOf(empty)).toBe(CustomErrorCode.mailComposeEmpty);
    expect(codeOf(past)).toBe(CustomErrorCode.mailSendAtInPast);
    expect(scheduled.ok && scheduled.data).toMatchObject({ status: "scheduled", threadSubject: "Renewal" });
    expect(await listView("outbox")).toEqual([threadId]);
    expect(await listView("drafts")).toEqual([]);

    const outbox = await asOwner(() => new GetMailOutboxInteractor(repo()).invoke());
    expect(outbox.ok && outbox.data.map((message) => message.body)).toEqual(["Later please"]);
  });

  it("sends only what is due, as the cron would, and cancelling puts the text back into the draft", async () => {
    const outbox = await asOwner(() => new GetMailOutboxInteractor(repo()).invoke());
    const [pending] = outbox.ok ? outbox.data : [];
    if (!pending) throw new Error("nothing scheduled");

    const delivered: string[] = [];
    const sender = (at: Date) =>
      new SendDueOutboxInteractor(
        repo(),
        (message) => {
          delivered.push(message.body);
          return Promise.resolve({ ok: true });
        },
        () => at,
      );

    const early = await sender(new Date("2026-10-01T09:30:00Z")).invoke();
    expect(early.ok && early.data.sent).toBe(0);

    const second = await asOwner(() =>
      new ScheduleMailInteractor(repo(), () => NOW).invoke(
        compose({ threadId: secondThreadId, body: "Cancel me", sendAt: new Date("2026-10-02T08:00:00Z") }),
      ),
    );
    const onTime = await sender(new Date("2026-10-01T10:00:30Z")).invoke();
    expect(onTime.ok && onTime.data.sent).toBe(1);
    expect(delivered).toEqual(["Later please"]);

    const sendAgain = await asOwner(() =>
      new SendOutboxMessageNowInteractor(repo(), () => NOW).invoke({ id: pending.id }),
    );
    expect(codeOf(sendAgain)).toBe(CustomErrorCode.mailOutboxNotEditable);

    if (!second.ok) throw new Error("second schedule failed");
    const cancelled = await asOwner(() => new CancelOutboxMessageInteractor(repo()).invoke({ id: second.data.id }));
    const restored = await asOwner(() => new GetMailDraftInteractor(repo()).invoke({ threadId: secondThreadId }));

    expect(cancelled.ok && cancelled.data.status).toBe("cancelled");
    expect(restored.ok && restored.data.draft?.body).toBe("Cancel me");
    expect(await listView("outbox")).toEqual([]);
  });

  it("archives out of the inbox and back, and a new reply clears archive and follow-up", async () => {
    await asOwner(() => new SetThreadArchivedInteractor(repo(), () => NOW).invoke({ threadId, archived: true }));
    await asOwner(() =>
      new SetThreadFollowUpInteractor(repo()).invoke({ threadId, followUpAt: new Date("2026-10-03T08:00:00Z") }),
    );

    expect(await listView("inbox")).toEqual([secondThreadId]);
    expect(await listView("archived")).toEqual([threadId]);
    expect(await listView("followUp")).toEqual([threadId]);

    await asOwner(() =>
      new PrismaMailboxRepo().refreshThreadSummary(threadId, {
        message: { sentAt: new Date("2026-10-02T12:00:00Z"), direction: "inbound", bodyText: "Thanks!" },
      } as never),
    );

    expect(await listView("inbox")).toEqual([secondThreadId, threadId].sort());
    expect(await listView("followUp")).toEqual([]);
  });

  it("keeps labels unique per company and filters conversations by label", async () => {
    const upsert = (name: string) =>
      asOwner(() => new UpsertMailLabelInteractor(repo()).invoke({ name, color: "secondary" }));

    const hot = await upsert("Hot lead");
    const duplicate = await upsert("hot LEAD");
    if (!hot.ok) throw new Error("label not created");

    const foreign = await runWithTenant(stranger, () =>
      new UpsertMailLabelInteractor(repo()).invoke({ name: "Hot lead", color: "secondary" }),
    );
    if (!foreign.ok) throw new Error("foreign label not created");

    const labelled = await runWithTenant(colleague, () =>
      new SetThreadLabelsInteractor(repo()).invoke({ threadId, labelIds: [hot.data.id] }),
    );
    const sharedLabel = await asOwner(() =>
      new SetThreadLabelsInteractor(repo()).invoke({ threadId, labelIds: [hot.data.id] }),
    );
    const crossCompany = await asOwner(() =>
      new SetThreadLabelsInteractor(repo()).invoke({ threadId, labelIds: [foreign.data.id] }),
    );

    expect(codeOf(duplicate)).toBe(CustomErrorCode.mailLabelNameTaken);
    expect(codeOf(labelled)).toBe(CustomErrorCode.mailboxThreadNotFound);
    expect(sharedLabel.ok && sharedLabel.data.labels.map((label) => label.name)).toEqual(["Hot lead"]);
    expect(codeOf(crossCompany)).toBe(CustomErrorCode.mailLabelNotFound);
    expect(await listView("inbox", hot.data.id)).toEqual([threadId]);
  });
});
