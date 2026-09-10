import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";

const db = vi.hoisted(() => {
  type Row = Record<string, unknown>;

  const isRow = (value: unknown): value is Row => typeof value === "object" && value !== null;

  const matchesValue = (actual: unknown, expected: unknown): boolean => {
    if (expected instanceof Date) return actual instanceof Date && actual.getTime() === expected.getTime();
    if (!isRow(expected)) return actual === expected;
    if ("is" in expected) return matchesValue(actual, expected.is);
    if ("some" in expected) return Array.isArray(actual) && actual.some((entry) => matchesValue(entry, expected.some));
    if ("none" in expected) return Array.isArray(actual) && !actual.some((entry) => matchesValue(entry, expected.none));
    if ("in" in expected) return Array.isArray(expected.in) && expected.in.includes(actual);
    if ("lt" in expected) return actual instanceof Date && expected.lt instanceof Date && actual < expected.lt;

    return isRow(actual) && Object.entries(expected).every(([key, value]) => matchesValue(actual[key], value));
  };

  const matches = (row: Row, where: Row): boolean =>
    Object.entries(where).every(([field, expected]) => {
      if (field === "OR" && Array.isArray(expected))
        return expected.some((clause) => isRow(clause) && matches(row, clause));

      return matchesValue(row[field], expected);
    });

  const collection = (rows: Row[]) => ({
    findMany: ({ where }: { where: Row }) => Promise.resolve(rows.filter((row) => matches(row, where))),
    findFirst: ({ where }: { where: Row }) => Promise.resolve(rows.find((row) => matches(row, where)) ?? null),
    create: ({ data }: { data: Row }) => {
      const created = { ...data };
      rows.push(created);

      return Promise.resolve(created);
    },
    updateMany: ({ where, data }: { where: Row; data: Row }) => {
      const affected = rows.filter((row) => matches(row, where));
      for (const row of affected) Object.assign(row, data);

      return Promise.resolve({ count: affected.length });
    },
    deleteMany: ({ where }: { where: Row }) => {
      const kept = rows.filter((row) => !matches(row, where));
      const count = rows.length - kept.length;
      rows.splice(0, rows.length, ...kept);

      return Promise.resolve({ count });
    },
  });

  const state = {
    accounts: [] as Row[],
    credentials: [] as Row[],
    threads: [] as Row[],
    messages: [] as Row[],
    deals: [] as Row[],
    dealContacts: [] as Row[],
  };

  const client = {
    connectedAccount: collection(state.accounts),
    mailboxCredential: collection(state.credentials),
    messagingThread: collection(state.threads),
    messagingMessage: collection(state.messages),
    deal: collection(state.deals),
    dealContact: collection(state.dealContacts),
  };

  return { state, client };
});

vi.mock("@/prisma/db", () => ({ prisma: db.client }));

import type { NormalizedMessage } from "../../sync/normalize-message";
import type { TenantUser } from "@/features/user/user.schema";

import { Action, Resource } from "@/generated/prisma";

import { runWithTenant } from "@/core/decorators/tenant-context";

import { PrismaMailboxRepo } from "../prisma-mailbox.repository";

const COMPANY_ID = "00000000-0000-4000-8000-0000000000f1";
const OWNER_ID = "00000000-0000-4000-8000-0000000000a1";
const COLLEAGUE_ID = "00000000-0000-4000-8000-0000000000a2";
const ACCOUNT_ID = "00000000-0000-4000-8000-0000000000b1";
const OTHER_COMPANY_ID = "00000000-0000-4000-8000-0000000000f2";
const OTHER_ACCOUNT_ID = "00000000-0000-4000-8000-0000000000b2";
const THREAD_ID = "00000000-0000-4000-8000-0000000000c1";
const DEAL_ID = "00000000-0000-4000-8000-0000000000e1";
const CONTACT_ID = "00000000-0000-4000-8000-0000000000e2";
const COUNTERPART = "anna@buyer.example";

const owner = createMockUser({ id: OWNER_ID, companyId: COMPANY_ID, email: "owner@vendor.example" });
const colleague = createMockUser({ id: COLLEAGUE_ID, companyId: COMPANY_ID, email: "colleague@vendor.example" });

function asOwner<T>(use: (repo: PrismaMailboxRepo) => Promise<T>): Promise<T> {
  return runWithTenant(owner, () => use(new PrismaMailboxRepo()));
}

function asColleague<T>(use: (repo: PrismaMailboxRepo) => Promise<T>): Promise<T> {
  return runWithTenant(colleague, () => use(new PrismaMailboxRepo()));
}

function asUser<T>(user: TenantUser, use: (repo: PrismaMailboxRepo) => Promise<T>): Promise<T> {
  return runWithTenant(user, () => use(new PrismaMailboxRepo()));
}

function userAllowed(permissions: { resource: Resource; action: Action }[]): TenantUser {
  return { ...createMockUserWithPermissions(permissions), id: OWNER_ID, companyId: COMPANY_ID };
}

function latestMessage(sentAt: Date, bodyText: string): NormalizedMessage {
  return {
    message: { sentAt, direction: "inbound", bodyText, bodyHtml: null },
    participants: [],
    sentAtSource: "header",
  } as unknown as NormalizedMessage;
}

function storeReply(repo: PrismaMailboxRepo, sentAt: Date, body: string) {
  return repo.storeOutboundReply({
    messagingThreadId: THREAD_ID,
    connectedAccountId: ACCOUNT_ID,
    storedMessageId: `imap:sent:${sentAt.toISOString()}`,
    subject: "Renewal quote",
    body,
    senderIdentifier: "owner@vendor.example",
    recipients: [COUNTERPART],
    sentAt,
  });
}

function seedThread(overrides: Record<string, unknown> = {}) {
  db.state.threads.push({
    id: THREAD_ID,
    companyId: COMPANY_ID,
    connectedAccountId: ACCOUNT_ID,
    connectedAccount: { userId: OWNER_ID },
    provider: "mail",
    state: "unread",
    subject: "Renewal quote",
    lastMessageAt: new Date("2026-09-01T10:00:00Z"),
    lastMessagePreview: "Here it is",
    lastMessageIsSender: false,
    sharedToCrm: false,
    linkedDealId: null,
    unipileThreadId: "imap:thread:root@buyer.example",
    participants: [{ companyId: COMPANY_ID, identifier: COUNTERPART, displayName: "Anna", isSelf: false }],
    messages: [],
    ...overrides,
  });
}

beforeEach(() => {
  db.state.accounts.splice(0, db.state.accounts.length, {
    id: ACCOUNT_ID,
    companyId: COMPANY_ID,
    userId: OWNER_ID,
    emailAddress: "owner@vendor.example",
    displayName: "Mailbox Owner",
  });

  db.state.credentials.splice(0, db.state.credentials.length, {
    id: "00000000-0000-4000-8000-0000000000d1",
    companyId: COMPANY_ID,
    connectedAccountId: ACCOUNT_ID,
    connectedAccount: { userId: OWNER_ID, emailAddress: "owner@vendor.example", displayName: "Mailbox Owner" },
    imapHost: "imap.mailhost.io",
    imapPort: 993,
    imapSecure: true,
    smtpHost: "smtp.mailhost.io",
    smtpPort: 587,
    smtpSecure: false,
    username: "owner@vendor.example",
    sealedSecret: "v1.sealed.sealed.sealed",
    syncCursors: [],
    backfillFrom: null,
    lastSyncedAt: null,
    lastVerifiedAt: null,
  });

  db.state.threads.splice(0, db.state.threads.length);
  db.state.messages.splice(0, db.state.messages.length);
  db.state.deals.splice(0, db.state.deals.length);
  db.state.dealContacts.splice(0, db.state.dealContacts.length);
});

describe("mailbox ownership", () => {
  it("lists only the mailboxes the caller connected", async () => {
    expect(await asOwner((repo) => repo.listConnectedMailboxes())).toHaveLength(1);
    expect(await asColleague((repo) => repo.listConnectedMailboxes())).toEqual([]);
  });

  it("hides another user's mailbox from a lookup by id", async () => {
    expect(await asOwner((repo) => repo.findConnectedMailbox(ACCOUNT_ID))).not.toBeNull();
    expect(await asColleague((repo) => repo.findConnectedMailbox(ACCOUNT_ID))).toBeNull();
  });

  it("leaves a mailbox and its mail connected when a colleague tries to disconnect it", async () => {
    await asColleague((repo) => repo.deleteConnectedMailbox(ACCOUNT_ID));
    expect(db.state.accounts).toHaveLength(1);

    await asOwner((repo) => repo.deleteConnectedMailbox(ACCOUNT_ID));
    expect(db.state.accounts).toEqual([]);
  });

  it("reaches an offboarded colleague's mailbox company-wide that the owner-scoped lookup hides", async () => {
    expect(await asColleague((repo) => repo.findConnectedMailbox(ACCOUNT_ID))).toBeNull();
    expect(await asColleague((repo) => repo.findConnectedMailboxCompanyWide(ACCOUNT_ID))).not.toBeNull();
  });

  it("disconnects a colleague's mailbox company-wide but never one from another company", async () => {
    db.state.accounts.push({
      id: OTHER_ACCOUNT_ID,
      companyId: OTHER_COMPANY_ID,
      userId: COLLEAGUE_ID,
      emailAddress: "colleague@rival.example",
      displayName: "Elsewhere",
    });

    await asColleague((repo) => repo.deleteConnectedMailboxCompanyWide(OTHER_ACCOUNT_ID));
    expect(db.state.accounts).toHaveLength(2);

    await asColleague((repo) => repo.deleteConnectedMailboxCompanyWide(ACCOUNT_ID));
    expect(db.state.accounts.map((account) => account.id)).toEqual([OTHER_ACCOUNT_ID]);
  });

  it("treats an address connected by a colleague as free rather than reporting who holds it", async () => {
    expect(await asOwner((repo) => repo.findMailboxByAddress("owner@vendor.example"))).not.toBeNull();
    expect(await asColleague((repo) => repo.findMailboxByAddress("owner@vendor.example"))).toBeNull();
  });

  it("lists only the caller's own conversations", async () => {
    seedThread();

    expect(await asOwner((repo) => repo.listThreadsForMailboxes(50, { search: null, folder: null }))).toHaveLength(1);
    expect(await asColleague((repo) => repo.listThreadsForMailboxes(50, { search: null, folder: null }))).toEqual([]);
  });

  it("refuses a colleague the messages of another user's conversation", async () => {
    seedThread();

    expect(await asOwner((repo) => repo.findThreadWithMessages(THREAD_ID))).not.toBeNull();
    expect(await asColleague((repo) => repo.findThreadWithMessages(THREAD_ID))).toBeNull();
  });

  it("gives a colleague nothing to reply from or forward with", async () => {
    seedThread();

    expect(await asOwner((repo) => repo.findReplyContext(THREAD_ID))).not.toBeNull();
    expect(await asColleague((repo) => repo.findReplyContext(THREAD_ID))).toBeNull();
  });

  it("keeps a colleague from marking another user's conversation read", async () => {
    seedThread();

    await asColleague((repo) => repo.markThreadRead(THREAD_ID));
    expect(db.state.threads[0].state).toBe("unread");

    await asOwner((repo) => repo.markThreadRead(THREAD_ID));
    expect(db.state.threads[0].state).toBe("open");
  });

  it("keeps a colleague from sharing or linking another user's conversation", async () => {
    seedThread();

    await asColleague((repo) => repo.setThreadShared(THREAD_ID, true));
    await asColleague((repo) => repo.setThreadDeal(THREAD_ID, "00000000-0000-4000-8000-0000000000e1"));
    expect(db.state.threads[0].sharedToCrm).toBe(false);
    expect(db.state.threads[0].linkedDealId).toBeNull();

    await asOwner((repo) => repo.setThreadShared(THREAD_ID, true));
    expect(db.state.threads[0].sharedToCrm).toBe(true);
  });

  it("hides another user's conversation from the deal link lookup", async () => {
    seedThread();

    expect(await asOwner((repo) => repo.findThreadForDealLink(THREAD_ID))).not.toBeNull();
    expect(await asColleague((repo) => repo.findThreadForDealLink(THREAD_ID))).toBeNull();
  });

  it("reads the folder list from the caller's own sync cursors", async () => {
    db.state.credentials[0].syncCursors = [
      { path: "INBOX", uidValidity: "42", uidNext: 12 },
      { path: "Archive", uidValidity: "42", uidNext: 3 },
    ];

    expect(await asOwner((repo) => repo.listStoredMailboxFolders())).toEqual(["Archive", "INBOX"]);
    expect(await asColleague((repo) => repo.listStoredMailboxFolders())).toEqual([]);
  });

  it("shows a colleague a conversation on a record once its owner shared it to the crm", async () => {
    seedThread({ sharedToCrm: true });

    const shared = await asColleague((repo) => repo.findSharedThreadsForIdentifiersCompanyWide([COUNTERPART]));
    const inbox = await asColleague((repo) => repo.listThreadsForMailboxes(50, { search: null, folder: null }));

    expect(shared.map((thread) => thread.id)).toEqual([THREAD_ID]);
    expect(inbox).toEqual([]);
  });

  it("keeps an unshared conversation off a colleague's record view", async () => {
    seedThread();

    expect(await asColleague((repo) => repo.findSharedThreadsForIdentifiersCompanyWide([COUNTERPART]))).toEqual([]);
  });
});

describe("thread summaries", () => {
  it("ignores an older message, so draining Sent after Inbox cannot rewind a conversation", async () => {
    seedThread();

    await asOwner((repo) =>
      repo.refreshThreadSummary(THREAD_ID, latestMessage(new Date("2026-07-02T10:00:00Z"), "An old sent copy")),
    );

    expect(db.state.threads[0].lastMessagePreview).toBe("Here it is");
    expect(db.state.threads[0].lastMessageAt).toEqual(new Date("2026-09-01T10:00:00Z"));
  });

  it("advances to a message that really is newer", async () => {
    seedThread();

    await asOwner((repo) =>
      repo.refreshThreadSummary(THREAD_ID, latestMessage(new Date("2026-09-08T10:00:00Z"), "The newest reply")),
    );

    expect(db.state.threads[0].lastMessagePreview).toBe("The newest reply");
    expect(db.state.threads[0].lastMessageAt).toEqual(new Date("2026-09-08T10:00:00Z"));
  });

  it("stores a reply that lands out of order without rewinding the summary", async () => {
    seedThread();

    await asOwner((repo) => storeReply(repo, new Date("2026-07-02T10:00:00Z"), "A reply that arrived late"));

    expect(db.state.messages).toHaveLength(1);
    expect(db.state.threads[0].lastMessagePreview).toBe("Here it is");
    expect(db.state.threads[0].lastMessageAt).toEqual(new Date("2026-09-01T10:00:00Z"));
    expect(db.state.threads[0].lastMessageIsSender).toBe(false);
  });

  it("advances the summary when a stored reply really is the newest message", async () => {
    seedThread();

    await asOwner((repo) => storeReply(repo, new Date("2026-09-08T10:00:00Z"), "The newest reply"));

    expect(db.state.threads[0].lastMessagePreview).toBe("The newest reply");
    expect(db.state.threads[0].lastMessageAt).toEqual(new Date("2026-09-08T10:00:00Z"));
    expect(db.state.threads[0].lastMessageIsSender).toBe(true);
  });

  it("fills in a summary a conversation has never had", async () => {
    seedThread({ lastMessageAt: null, lastMessagePreview: null });

    await asOwner((repo) =>
      repo.refreshThreadSummary(THREAD_ID, latestMessage(new Date("2026-01-05T10:00:00Z"), "The first one")),
    );

    expect(db.state.threads[0].lastMessagePreview).toBe("The first one");
  });

  it("removes a thread that owns no messages and keeps one that does", async () => {
    seedThread();

    await asOwner((repo) => repo.deleteThreadIfEmpty(THREAD_ID));
    expect(db.state.threads).toEqual([]);

    seedThread({ messages: [{ id: "message-1" }] });
    await asOwner((repo) => repo.deleteThreadIfEmpty(THREAD_ID));
    expect(db.state.threads).toHaveLength(1);
  });
});

const DEALS_READ_ALL = [{ resource: Resource.deals, action: Action.readAll }];
const INBOX_ONLY = [{ resource: Resource.inboxMessages, action: Action.readAll }];

function seedDeal() {
  const deal = { id: DEAL_ID, companyId: COMPANY_ID, name: "Acme renewal", status: "open", users: [] as unknown[] };

  db.state.deals.push(deal);
  db.state.dealContacts.push({ companyId: COMPANY_ID, dealId: DEAL_ID, contactId: CONTACT_ID, deal });

  return deal;
}

describe("deal reads follow the deals access predicate", () => {
  it("names a deal for a reader who may read deals and nothing for one who may not", async () => {
    seedDeal();

    const allowed = await asUser(userAllowed(DEALS_READ_ALL), (repo) => repo.findDealNames([DEAL_ID]));
    const refused = await asUser(userAllowed(INBOX_ONLY), (repo) => repo.findDealNames([DEAL_ID]));

    expect(allowed.map((deal) => deal.id)).toEqual([DEAL_ID]);
    expect(refused).toEqual([]);
  });

  it("offers no deal candidate to a user the deals predicate excludes", async () => {
    seedDeal();

    const allowed = await asUser(userAllowed(DEALS_READ_ALL), (repo) => repo.findDealCandidates([CONTACT_ID]));
    const refused = await asUser(userAllowed(INBOX_ONLY), (repo) => repo.findDealCandidates([CONTACT_ID]));

    expect(allowed).toEqual([{ dealId: DEAL_ID, contactId: CONTACT_ID, isOpen: true }]);
    expect(refused).toEqual([]);
  });

  it("keeps a linked conversation off a deal the reader may not read", async () => {
    const deal = seedDeal();
    seedThread({ sharedToCrm: true, linkedDealId: DEAL_ID, linkedDeal: deal });

    const allowed = await asUser(userAllowed(DEALS_READ_ALL), (repo) =>
      repo.findThreadsLinkedToDealCompanyWide(DEAL_ID),
    );
    const refused = await asUser(userAllowed(INBOX_ONLY), (repo) => repo.findThreadsLinkedToDealCompanyWide(DEAL_ID));

    expect(allowed.map((thread) => thread.id)).toEqual([THREAD_ID]);
    expect(refused).toEqual([]);
  });
});
