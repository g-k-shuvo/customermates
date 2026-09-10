import { describe, expect, it, vi } from "vitest";

import type { MailboxFetchPage, MailboxFolderCursor, MailboxTransport } from "../mailbox-transport";

import { parseSecretBoxKey, sealSecret } from "../../credentials/secret-box";
import { SyncMailboxService } from "../sync-mailbox.service";

const KEY = parseSecretBoxKey(Buffer.alloc(32, 5).toString("base64"));
const ACCOUNT_ID = "00000000-0000-4000-8000-0000000000b1";
const NOW = () => new Date("2026-09-09T10:00:00Z");

function account(overrides: { syncCursors?: MailboxFolderCursor[]; backfillFrom?: Date | null } = {}) {
  return {
    connectedAccountId: ACCOUNT_ID,
    emailAddress: "max@vendor.example",
    displayName: "Max",
    imapHost: "imap.mailhost.io",
    imapPort: 993,
    imapSecure: true,
    username: "max@vendor.example",
    sealedSecret: sealSecret(KEY, "app-password"),
    syncCursors: overrides.syncCursors ?? [],
    backfillFrom: overrides.backfillFrom ?? null,
  };
}

function emptyPage(path: string): MailboxFetchPage {
  return { cursor: { path, uidValidity: "42", uidNext: 900 }, messages: [], reachedEnd: true };
}

function harness() {
  const fetchSince = vi.fn((_connection: unknown, request: { path: string }) =>
    Promise.resolve(emptyPage(request.path)),
  );
  const saveCursor = vi.fn(() => Promise.resolve(undefined));
  const transport = { fetchSince } as unknown as MailboxTransport;
  const repo = { companyId: "test-company-id", saveCursor } as never;

  return { service: new SyncMailboxService(repo, transport, KEY, NOW), fetchSince, saveCursor };
}

describe("SyncMailboxService", () => {
  it("passes the stored backfill bound to the transport when the folder has no cursor", async () => {
    const backfillFrom = new Date("2026-06-11T10:00:00Z");
    const { service, fetchSince } = harness();

    await service.syncFolder(account({ backfillFrom }), "INBOX", 100);

    expect(fetchSince).toHaveBeenCalledWith(expect.objectContaining({ host: "imap.mailhost.io" }), {
      path: "INBOX",
      cursor: null,
      backfillFrom,
      limit: 100,
    });
  });

  it("passes the folder's own cursor alongside the bound", async () => {
    const backfillFrom = new Date("2026-06-11T10:00:00Z");
    const cursor = { path: "INBOX", uidValidity: "42", uidNext: 881 };
    const { service, fetchSince } = harness();

    await service.syncFolder(
      account({ backfillFrom, syncCursors: [cursor, { path: "Archive", uidValidity: "42", uidNext: 5 }] }),
      "INBOX",
      100,
    );

    expect(fetchSince).toHaveBeenCalledWith(expect.anything(), { path: "INBOX", cursor, backfillFrom, limit: 100 });
  });

  it("stores the returned cursor so a repeated sync resumes rather than restarting", async () => {
    const { service, saveCursor } = harness();

    const outcome = await service.syncFolder(account(), "INBOX", 100);

    expect(saveCursor).toHaveBeenCalledWith(ACCOUNT_ID, { path: "INBOX", uidValidity: "42", uidNext: 900 }, NOW());
    expect(outcome.messagesStored).toBe(0);
    expect(outcome.threadsTouched).toBe(0);
  });
});

const THREAD_ID = "00000000-0000-4000-8000-0000000000e9";
const CONTACT_ID = "00000000-0000-4000-8000-0000000000c1";

function inboundSource(subject: string, messageId: string): Buffer {
  return Buffer.from(
    [
      "From: Anna <anna@buyer.example>",
      "To: Max <max@vendor.example>",
      `Subject: ${subject}`,
      `Message-ID: <${messageId}>`,
      "Date: Tue, 08 Sep 2026 10:00:00 +0000",
      "",
      "The numbers are attached.",
      "",
    ].join("\r\n"),
    "utf8",
  );
}

function pageWithOneMessage(path: string): MailboxFetchPage {
  return {
    cursor: { path, uidValidity: "42", uidNext: 901 },
    messages: [
      {
        uid: 900,
        source: inboundSource("Quarterly numbers", "anna-1@buyer.example"),
        flags: [],
        internalDate: new Date("2026-09-08T10:00:00Z"),
      },
    ],
    reachedEnd: true,
  };
}

function matchingHarness(options: { created?: boolean; stored?: boolean } = {}) {
  const upsertThread = vi.fn(() =>
    Promise.resolve({ id: THREAD_ID, threadKey: "thread-key", created: options.created ?? true }),
  );
  const storeMessage = vi.fn(() => Promise.resolve(options.stored ?? true));
  const storeParticipants = vi.fn(() => Promise.resolve(undefined));
  const refreshThreadSummary = vi.fn(() => Promise.resolve(undefined));
  const deleteThreadIfEmpty = vi.fn(() => Promise.resolve(undefined));
  const findContactMatches = vi.fn(() =>
    Promise.resolve([{ identifier: "anna@buyer.example", contactId: CONTACT_ID }]),
  );
  const setThreadShared = vi.fn(() => Promise.resolve(undefined));
  const saveCursor = vi.fn(() => Promise.resolve(undefined));

  const transport = {
    fetchSince: vi.fn((_connection: unknown, request: { path: string }) =>
      Promise.resolve(pageWithOneMessage(request.path)),
    ),
  } as unknown as MailboxTransport;

  const repo = {
    companyId: "test-company-id",
    upsertThread,
    storeMessage,
    storeParticipants,
    refreshThreadSummary,
    deleteThreadIfEmpty,
    findContactMatches,
    setThreadShared,
    saveCursor,
  } as never;

  return {
    service: new SyncMailboxService(repo, transport, KEY, NOW),
    findContactMatches,
    setThreadShared,
    refreshThreadSummary,
    deleteThreadIfEmpty,
  };
}

describe("SyncMailboxService contact matching", () => {
  it("leaves a newly synced conversation private, because sharing is the reader's decision", async () => {
    const { service, findContactMatches, setThreadShared } = matchingHarness();

    await service.syncFolder(account(), "INBOX", 100);

    expect(findContactMatches).not.toHaveBeenCalled();
    expect(setThreadShared).not.toHaveBeenCalled();
  });

  it("shares nothing when the mailbox has seen the conversation before either", async () => {
    const { service, setThreadShared } = matchingHarness({ created: false });

    await service.syncFolder(account(), "INBOX", 100);

    expect(setThreadShared).not.toHaveBeenCalled();
  });
});

describe("SyncMailboxService thread creation", () => {
  it("keeps a thread whose page brought a message of its own", async () => {
    const { service, refreshThreadSummary, deleteThreadIfEmpty } = matchingHarness();

    await service.syncFolder(account(), "INBOX", 100);

    expect(refreshThreadSummary).toHaveBeenCalled();
    expect(deleteThreadIfEmpty).not.toHaveBeenCalled();
  });

  it("removes a thread it just created when every message was already stored elsewhere", async () => {
    const { service, refreshThreadSummary, deleteThreadIfEmpty } = matchingHarness({ stored: false });

    const outcome = await service.syncFolder(account(), "INBOX", 100);

    expect(deleteThreadIfEmpty).toHaveBeenCalledWith(THREAD_ID);
    expect(refreshThreadSummary).not.toHaveBeenCalled();
    expect(outcome.messagesStored).toBe(0);
  });

  it("leaves a thread it did not create alone when a page brings nothing new", async () => {
    const { service, deleteThreadIfEmpty, refreshThreadSummary } = matchingHarness({ created: false, stored: false });

    await service.syncFolder(account(), "INBOX", 100);

    expect(deleteThreadIfEmpty).not.toHaveBeenCalled();
    expect(refreshThreadSummary).toHaveBeenCalled();
  });
});
