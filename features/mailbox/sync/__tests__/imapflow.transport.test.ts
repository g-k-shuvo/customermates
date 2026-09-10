import { describe, expect, it, vi } from "vitest";

import { createImapflowTransport, type ImapClient, type ImapFetchedMessage } from "../imapflow.transport";
import { MailboxTransportError, MailboxTransportFailure, type MailboxConnection } from "../mailbox-transport";
import type { AddressLookup } from "../resolve-imap-address";

const CONNECTION: MailboxConnection = {
  host: "imap.mailhost.io",
  port: 993,
  secure: true,
  username: "max@company.com",
  secret: "app-password",
};

const PUBLIC_LOOKUP: AddressLookup = () => Promise.resolve([{ address: "93.184.216.34", family: 4 }]);

type ClientOverrides = Partial<ImapClient> & { connectError?: Error };

type StubbedClient = {
  client: ImapClient;
  released: { count: number };
  logout: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  append: ReturnType<typeof vi.fn>;
  search: ReturnType<typeof vi.fn>;
};

const UNBOUNDED = { backfillFrom: null };

function asyncIterableOf(messages: readonly ImapFetchedMessage[]): AsyncIterable<ImapFetchedMessage> {
  let index = 0;

  return {
    [Symbol.asyncIterator]: () => ({
      next: () =>
        Promise.resolve(
          index < messages.length
            ? { value: messages[index++], done: false as const }
            : { value: undefined as never, done: true as const },
        ),
    }),
  };
}

function fetchYielding(...messages: readonly ImapFetchedMessage[]) {
  return vi.fn(() => asyncIterableOf(messages));
}

function fetchRejecting(reason: Error) {
  return vi.fn(() => ({
    [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(reason) }),
  })) as unknown as ImapClient["fetch"];
}

function stubClient(overrides: ClientOverrides = {}): StubbedClient {
  const released = { count: 0 };
  const logout = vi.fn(() => Promise.resolve(undefined));
  const close = vi.fn();
  const append = vi.fn(() => Promise.resolve(undefined));
  const search = vi.fn(() => Promise.resolve([]));

  const client = {
    connect: vi.fn(() => (overrides.connectError ? Promise.reject(overrides.connectError) : Promise.resolve())),
    logout,
    close,
    list: vi.fn(() => Promise.resolve([])),
    getMailboxLock: vi.fn(() =>
      Promise.resolve({
        release: () => {
          released.count += 1;
        },
      }),
    ),
    search,
    fetch: fetchYielding(),
    append,
    mailbox: { uidValidity: 42n, uidNext: 1 },
    ...overrides,
  } as unknown as ImapClient;

  return {
    client,
    released,
    logout: (overrides.logout ?? logout) as ReturnType<typeof vi.fn>,
    close,
    append,
    search: (overrides.search ?? search) as ReturnType<typeof vi.fn>,
  };
}

function message(uid: number): ImapFetchedMessage {
  return { uid, source: Buffer.from(`Message-ID: <m${uid}@mailhost.io>`), flags: new Set(["\\Seen"]) };
}

async function failureOf(promise: Promise<unknown>) {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof MailboxTransportError ? error : null;
  }
}

describe("createImapflowTransport", () => {
  it("connects to the pinned address while verifying tls against the hostname", async () => {
    const { client } = stubClient();
    const createClient = vi.fn(() => client);

    await createImapflowTransport(createClient, PUBLIC_LOOKUP).verify(CONNECTION);

    expect(createClient).toHaveBeenCalledWith({
      host: "93.184.216.34",
      port: 993,
      secure: true,
      servername: "imap.mailhost.io",
      username: "max@company.com",
      secret: "app-password",
    });
  });

  it("never constructs a client when the host is refused", async () => {
    const createClient = vi.fn(() => stubClient().client);

    const failure = await failureOf(
      createImapflowTransport(createClient, PUBLIC_LOOKUP).verify({ ...CONNECTION, host: "127.0.0.1" }),
    );

    expect(failure?.failure).toBe(MailboxTransportFailure.hostRejected);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("never constructs a client when the name resolves to internal infrastructure", async () => {
    const createClient = vi.fn(() => stubClient().client);
    const internal: AddressLookup = () => Promise.resolve([{ address: "169.254.169.254", family: 4 }]);

    const failure = await failureOf(createImapflowTransport(createClient, internal).verify(CONNECTION));

    expect(failure?.hostRejection).toBe("linkLocalAddress");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("classifies a rejected login as an authentication failure", async () => {
    const { client } = stubClient({ connectError: new Error("Invalid credentials (Failure)") });

    const failure = await failureOf(createImapflowTransport(() => client, PUBLIC_LOOKUP).verify(CONNECTION));

    expect(failure?.failure).toBe(MailboxTransportFailure.authenticationFailed);
  });

  it("classifies a refused socket separately from a timeout", async () => {
    const refused = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    const timedOut = Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" });

    const refusedFailure = await failureOf(
      createImapflowTransport(() => stubClient({ connectError: refused }).client, PUBLIC_LOOKUP).verify(CONNECTION),
    );
    const timeoutFailure = await failureOf(
      createImapflowTransport(() => stubClient({ connectError: timedOut }).client, PUBLIC_LOOKUP).verify(CONNECTION),
    );

    expect(refusedFailure?.failure).toBe(MailboxTransportFailure.connectionRefused);
    expect(timeoutFailure?.failure).toBe(MailboxTransportFailure.connectionTimedOut);
  });

  it("classifies a certificate problem as a tls failure", async () => {
    const { client } = stubClient({ connectError: new Error("self signed certificate in chain") });

    const failure = await failureOf(createImapflowTransport(() => client, PUBLIC_LOOKUP).verify(CONNECTION));

    expect(failure?.failure).toBe(MailboxTransportFailure.tlsFailed);
  });

  it("logs out even when the operation fails", async () => {
    const { client, logout } = stubClient({
      list: vi.fn(() => Promise.reject(new Error("boom"))),
    });

    await failureOf(createImapflowTransport(() => client, PUBLIC_LOOKUP).listFolders(CONNECTION));

    expect(logout).toHaveBeenCalledTimes(1);
  });

  it("closes the socket when logout itself fails", async () => {
    const { client, close } = stubClient({
      logout: vi.fn(() => Promise.reject(new Error("already gone"))),
    });

    await createImapflowTransport(() => client, PUBLIC_LOOKUP).verify(CONNECTION);

    expect(close).toHaveBeenCalledTimes(1);
  });

  it("maps folders and keeps the special-use marker", async () => {
    const { client } = stubClient({
      list: vi.fn(() =>
        Promise.resolve([
          { path: "INBOX", name: "INBOX", subscribed: true },
          { path: "[Gmail]/Sent Mail", name: "Sent Mail", specialUse: "\\Sent", subscribed: true },
        ]),
      ),
    });

    const folders = await createImapflowTransport(() => client, PUBLIC_LOOKUP).listFolders(CONNECTION);

    expect(folders).toEqual([
      { path: "INBOX", name: "INBOX", specialUse: null, subscribed: true },
      { path: "[Gmail]/Sent Mail", name: "Sent Mail", specialUse: "\\Sent", subscribed: true },
    ]);
  });

  it("fetches from the start when there is no cursor and advances it past the last uid", async () => {
    const fetch = fetchYielding(message(1), message(2), message(3));
    const { client, released } = stubClient({ fetch, mailbox: { uidValidity: 42n, uidNext: 4 } });

    const page = await createImapflowTransport(() => client, PUBLIC_LOOKUP).fetchSince(CONNECTION, {
      path: "INBOX",
      cursor: null,
      limit: 100,
      ...UNBOUNDED,
    });

    expect(fetch).toHaveBeenCalledWith("1:3", expect.objectContaining({ uid: true, source: true }));
    expect(page.messages.map((m) => m.uid)).toEqual([1, 2, 3]);
    expect(page.cursor).toEqual({ path: "INBOX", uidValidity: "42", uidNext: 4 });
    expect(page.reachedEnd).toBe(true);
    expect(released.count).toBe(1);
  });

  it("resumes from the cursor rather than refetching the mailbox", async () => {
    const fetch = fetchYielding(message(7));
    const { client } = stubClient({ fetch, mailbox: { uidValidity: 42n, uidNext: 8 } });

    await createImapflowTransport(() => client, PUBLIC_LOOKUP).fetchSince(CONNECTION, {
      path: "INBOX",
      cursor: { path: "INBOX", uidValidity: "42", uidNext: 7 },
      limit: 100,
      ...UNBOUNDED,
    });

    expect(fetch).toHaveBeenCalledWith("7:7", expect.anything());
  });

  it("restarts the folder when uidValidity changed underneath the cursor", async () => {
    const fetch = fetchYielding(message(1));
    const { client } = stubClient({ fetch, mailbox: { uidValidity: 99n, uidNext: 2 } });

    const page = await createImapflowTransport(() => client, PUBLIC_LOOKUP).fetchSince(CONNECTION, {
      path: "INBOX",
      cursor: { path: "INBOX", uidValidity: "42", uidNext: 500 },
      limit: 100,
      ...UNBOUNDED,
    });

    expect(fetch).toHaveBeenCalledWith("1:1", expect.anything());
    expect(page.cursor.uidValidity).toBe("99");
  });

  it("bounds a page by the requested limit and reports that more remain", async () => {
    const fetch = fetchYielding(message(1), message(2));
    const { client } = stubClient({ fetch, mailbox: { uidValidity: 42n, uidNext: 1000 } });

    const page = await createImapflowTransport(() => client, PUBLIC_LOOKUP).fetchSince(CONNECTION, {
      path: "INBOX",
      cursor: null,
      limit: 2,
      ...UNBOUNDED,
    });

    expect(fetch).toHaveBeenCalledWith("1:2", expect.anything());
    expect(page.reachedEnd).toBe(false);
    expect(page.cursor.uidNext).toBe(3);
  });

  it("moves past a page whose messages were all expunged instead of asking for it again forever", async () => {
    const fetch = fetchYielding();
    const { client } = stubClient({ fetch, mailbox: { uidValidity: 42n, uidNext: 1000 } });

    const page = await createImapflowTransport(() => client, PUBLIC_LOOKUP).fetchSince(CONNECTION, {
      path: "INBOX",
      cursor: { path: "INBOX", uidValidity: "42", uidNext: 10 },
      limit: 5,
      ...UNBOUNDED,
    });

    expect(fetch).toHaveBeenCalledWith("10:14", expect.anything());
    expect(page.messages).toEqual([]);
    expect(page.cursor.uidNext).toBe(15);
    expect(page.reachedEnd).toBe(false);
  });

  it("fetches nothing and reports the end when the cursor is already current", async () => {
    const fetch = fetchYielding();
    const { client } = stubClient({ fetch, mailbox: { uidValidity: 42n, uidNext: 9 } });

    const page = await createImapflowTransport(() => client, PUBLIC_LOOKUP).fetchSince(CONNECTION, {
      path: "INBOX",
      cursor: { path: "INBOX", uidValidity: "42", uidNext: 9 },
      limit: 100,
      ...UNBOUNDED,
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(page.messages).toEqual([]);
    expect(page.reachedEnd).toBe(true);
  });

  it("releases the mailbox lock even when the fetch throws", async () => {
    const fetch = fetchRejecting(new Error("connection dropped mid-fetch"));
    const { client, released } = stubClient({ fetch, mailbox: { uidValidity: 42n, uidNext: 4 } });

    await failureOf(
      createImapflowTransport(() => client, PUBLIC_LOOKUP).fetchSince(CONNECTION, {
        path: "INBOX",
        cursor: null,
        limit: 10,
        ...UNBOUNDED,
      }),
    );

    expect(released.count).toBe(1);
  });

  it("starts a bounded first fetch at the oldest uid inside the backfill window", async () => {
    const backfillFrom = new Date("2026-06-09T10:00:00Z");
    const fetch = fetchYielding(message(880), message(881));
    const search = vi.fn(() => Promise.resolve([881, 880, 900]));
    const { client } = stubClient({ fetch, search, mailbox: { uidValidity: 42n, uidNext: 901 } });

    const page = await createImapflowTransport(() => client, PUBLIC_LOOKUP).fetchSince(CONNECTION, {
      path: "INBOX",
      cursor: null,
      backfillFrom,
      limit: 100,
    });

    expect(search).toHaveBeenCalledWith({ since: backfillFrom }, { uid: true });
    expect(fetch).toHaveBeenCalledWith("880:900", expect.anything());
    expect(page.cursor.uidNext).toBe(882);
  });

  it("keeps the stored cursor in charge and never searches when one exists", async () => {
    const fetch = fetchYielding(message(7));
    const search = vi.fn(() => Promise.resolve([1]));
    const { client } = stubClient({ fetch, search, mailbox: { uidValidity: 42n, uidNext: 8 } });

    await createImapflowTransport(() => client, PUBLIC_LOOKUP).fetchSince(CONNECTION, {
      path: "INBOX",
      cursor: { path: "INBOX", uidValidity: "42", uidNext: 7 },
      backfillFrom: new Date("2026-06-09T10:00:00Z"),
      limit: 100,
    });

    expect(search).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith("7:7", expect.anything());
  });

  it("re-searches the bound when uidValidity invalidated the cursor", async () => {
    const backfillFrom = new Date("2026-06-09T10:00:00Z");
    const fetch = fetchYielding(message(500));
    const search = vi.fn(() => Promise.resolve([500]));
    const { client } = stubClient({ fetch, search, mailbox: { uidValidity: 99n, uidNext: 501 } });

    await createImapflowTransport(() => client, PUBLIC_LOOKUP).fetchSince(CONNECTION, {
      path: "INBOX",
      cursor: { path: "INBOX", uidValidity: "42", uidNext: 7 },
      backfillFrom,
      limit: 100,
    });

    expect(search).toHaveBeenCalledWith({ since: backfillFrom }, { uid: true });
    expect(fetch).toHaveBeenCalledWith("500:500", expect.anything());
  });

  it("stores a cursor at the end of the folder when nothing falls inside the bound", async () => {
    const fetch = fetchYielding();
    const search = vi.fn(() => Promise.resolve([]));
    const { client } = stubClient({ fetch, search, mailbox: { uidValidity: 42n, uidNext: 900 } });

    const page = await createImapflowTransport(() => client, PUBLIC_LOOKUP).fetchSince(CONNECTION, {
      path: "INBOX",
      cursor: null,
      backfillFrom: new Date("2026-06-09T10:00:00Z"),
      limit: 100,
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(page.messages).toEqual([]);
    expect(page.reachedEnd).toBe(true);
    expect(page.cursor).toEqual({ path: "INBOX", uidValidity: "42", uidNext: 900 });
  });

  it("falls back to the whole folder when the server cannot answer the search", async () => {
    const fetch = fetchYielding(message(1));
    const search = vi.fn(() => Promise.resolve(false as const));
    const { client } = stubClient({ fetch, search, mailbox: { uidValidity: 42n, uidNext: 2 } });

    await createImapflowTransport(() => client, PUBLIC_LOOKUP).fetchSince(CONNECTION, {
      path: "INBOX",
      cursor: null,
      backfillFrom: new Date("2026-06-09T10:00:00Z"),
      limit: 100,
    });

    expect(fetch).toHaveBeenCalledWith("1:1", expect.anything());
  });

  it("fetches nothing on a second bounded run once the first stored a cursor", async () => {
    const backfillFrom = new Date("2026-06-09T10:00:00Z");
    const first = fetchYielding(message(880));
    const firstClient = stubClient({
      fetch: first,
      search: vi.fn(() => Promise.resolve([880])),
      mailbox: { uidValidity: 42n, uidNext: 881 },
    });

    const page = await createImapflowTransport(() => firstClient.client, PUBLIC_LOOKUP).fetchSince(CONNECTION, {
      path: "INBOX",
      cursor: null,
      backfillFrom,
      limit: 100,
    });

    const second = fetchYielding();
    const secondClient = stubClient({
      fetch: second,
      search: vi.fn(() => Promise.resolve([880])),
      mailbox: { uidValidity: 42n, uidNext: 881 },
    });

    const repeated = await createImapflowTransport(() => secondClient.client, PUBLIC_LOOKUP).fetchSince(CONNECTION, {
      path: "INBOX",
      cursor: page.cursor,
      backfillFrom,
      limit: 100,
    });

    expect(second).not.toHaveBeenCalled();
    expect(repeated.messages).toEqual([]);
    expect(repeated.cursor).toEqual(page.cursor);
  });

  it("appends to the discovered sent folder", async () => {
    const { client, append } = stubClient({
      list: vi.fn(() =>
        Promise.resolve([
          { path: "INBOX", name: "INBOX" },
          { path: "[Gmail]/Sent Mail", name: "Sent Mail", specialUse: "\\Sent" },
        ]),
      ),
    });

    await createImapflowTransport(() => client, PUBLIC_LOOKUP).appendToSent(CONNECTION, Buffer.from("raw"), null);

    expect(append).toHaveBeenCalledWith("[Gmail]/Sent Mail", Buffer.from("raw"));
  });

  it("reports a missing sent folder rather than silently dropping the copy", async () => {
    const { client, append } = stubClient({ list: vi.fn(() => Promise.resolve([{ path: "INBOX", name: "INBOX" }])) });

    const failure = await failureOf(
      createImapflowTransport(() => client, PUBLIC_LOOKUP).appendToSent(CONNECTION, Buffer.from("raw"), null),
    );

    expect(failure?.failure).toBe(MailboxTransportFailure.folderMissing);
    expect(append).not.toHaveBeenCalled();
  });
});
