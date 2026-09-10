import { ImapFlow } from "imapflow";

import {
  MailboxTransportError,
  MailboxTransportFailure,
  type FetchedMessage,
  type MailboxConnection,
  type MailboxFetchPage,
  type MailboxFolder,
  type MailboxTransport,
} from "./mailbox-transport";
import { pinImapTarget, type AddressLookup } from "./resolve-imap-address";

export type ImapClientOptions = {
  host: string;
  port: number;
  secure: boolean;
  servername: string;
  username: string;
  secret: string;
};

export type ImapMailboxState = { uidValidity: bigint | number | string; uidNext: number };

export type ImapListEntry = {
  path: string;
  name: string;
  specialUse?: string;
  subscribed?: boolean;
};

export type ImapFetchedMessage = {
  uid: number;
  source: Buffer;
  flags?: Set<string> | readonly string[];
  internalDate?: Date;
};

export type ImapSearchQuery = { since: Date };

export type ImapClient = {
  connect(): Promise<void>;
  logout(): Promise<void>;
  close(): void;
  list(): Promise<readonly ImapListEntry[]>;
  getMailboxLock(path: string): Promise<{ release(): void }>;
  search(query: ImapSearchQuery, options: { uid: boolean }): Promise<number[] | false | undefined>;
  fetch(range: string, options: Record<string, boolean>): AsyncIterable<ImapFetchedMessage>;
  append(path: string, source: Buffer): Promise<unknown>;
  mailbox: ImapMailboxState | false;
};

export type ImapClientFactory = (options: ImapClientOptions) => ImapClient;

const defaultFactory: ImapClientFactory = (options) =>
  new ImapFlow({
    host: options.host,
    port: options.port,
    secure: options.secure,
    servername: options.servername,
    auth: { user: options.username, pass: options.secret },
    logger: false,
    emitLogs: false,
  }) as unknown as ImapClient;

const AUTHENTICATION_MARKERS = ["authenticationfailed", "invalid credentials", "login failed", "authenticate failed"];
const TLS_MARKERS = ["certificate", "self signed", "wrong version number", "unable to verify", "eproto"];
const REFUSED_CODES = new Set(["ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH", "ECONNRESET", "EPIPE"]);
const TIMEOUT_CODES = new Set(["ETIMEDOUT", "ESOCKETTIMEDOUT", "ECONNTIMEOUT"]);

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
}

function codeOf(error: unknown): string {
  const code = (error as { code?: unknown })?.code;

  return typeof code === "string" ? code.toUpperCase() : "";
}

function classifyImapError(error: unknown): MailboxTransportFailure {
  if (error instanceof MailboxTransportError) return error.failure;

  const code = codeOf(error);
  if (TIMEOUT_CODES.has(code)) return MailboxTransportFailure.connectionTimedOut;
  if (REFUSED_CODES.has(code)) return MailboxTransportFailure.connectionRefused;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return MailboxTransportFailure.unresolvableHost;

  const message = messageOf(error);
  if (AUTHENTICATION_MARKERS.some((marker) => message.includes(marker)))
    return MailboxTransportFailure.authenticationFailed;
  if (TLS_MARKERS.some((marker) => message.includes(marker))) return MailboxTransportFailure.tlsFailed;
  if (code.startsWith("ERR_TLS") || code.startsWith("CERT_") || code.startsWith("DEPTH_ZERO"))
    return MailboxTransportFailure.tlsFailed;
  if (message.includes("timed out") || message.includes("timeout")) return MailboxTransportFailure.connectionTimedOut;
  if (message.includes("does not exist") || message.includes("nonexistent"))
    return MailboxTransportFailure.folderMissing;

  return MailboxTransportFailure.protocolFailed;
}

function asTransportError(error: unknown): MailboxTransportError {
  if (error instanceof MailboxTransportError) return error;

  return new MailboxTransportError(classifyImapError(error));
}

function flagsOf(message: ImapFetchedMessage): readonly string[] {
  if (!message.flags) return [];

  return Array.isArray(message.flags) ? [...message.flags] : [...(message.flags as Set<string>)];
}

async function firstUidWithin(client: ImapClient, backfillFrom: Date | null, uidNext: number): Promise<number> {
  if (!backfillFrom) return 1;

  const found = await client.search({ since: backfillFrom }, { uid: true });
  if (!Array.isArray(found)) return 1;
  if (found.length === 0) return uidNext;

  return found.reduce((lowest, uid) => Math.min(lowest, uid), uidNext);
}

function mailboxStateOf(client: ImapClient): ImapMailboxState {
  const { mailbox } = client;
  if (!mailbox) throw new MailboxTransportError(MailboxTransportFailure.folderMissing);

  return mailbox;
}

export type ImapflowTransportOptions = {
  allowPrivateHosts?: boolean;
};

export function createImapflowTransport(
  createClient: ImapClientFactory = defaultFactory,
  resolveAddresses?: AddressLookup,
  options: ImapflowTransportOptions = {},
): MailboxTransport {
  async function withClient<T>(connection: MailboxConnection, use: (client: ImapClient) => Promise<T>): Promise<T> {
    const target = await pinImapTarget(connection.host, resolveAddresses, {
      allowPrivateHosts: options.allowPrivateHosts,
    });
    const client = createClient({
      host: target.address,
      port: connection.port,
      secure: connection.secure,
      servername: target.servername,
      username: connection.username,
      secret: connection.secret,
    });

    try {
      await client.connect();
    } catch (error) {
      throw asTransportError(error);
    }

    try {
      return await use(client);
    } catch (error) {
      throw asTransportError(error);
    } finally {
      try {
        await client.logout();
      } catch {
        client.close();
      }
    }
  }

  return {
    async verify(connection) {
      await withClient(connection, () => Promise.resolve(undefined));
    },

    async listFolders(connection) {
      return await withClient(connection, async (client) => {
        const entries = await client.list();

        return entries.map<MailboxFolder>((entry) => ({
          path: entry.path,
          name: entry.name,
          specialUse: entry.specialUse ?? null,
          subscribed: entry.subscribed ?? false,
        }));
      });
    },

    async fetchSince(connection, request) {
      const { path, cursor } = request;

      return await withClient(connection, async (client) => {
        const lock = await client.getMailboxLock(path);

        try {
          const state = mailboxStateOf(client);
          const uidValidity = String(state.uidValidity);
          const from =
            cursor && cursor.uidValidity === uidValidity && cursor.path === path
              ? cursor.uidNext
              : await firstUidWithin(client, request.backfillFrom, state.uidNext);

          if (from >= state.uidNext) {
            return {
              cursor: { path, uidValidity, uidNext: state.uidNext },
              messages: [],
              reachedEnd: true,
            } satisfies MailboxFetchPage;
          }

          const ceiling = Math.min(state.uidNext - 1, from + request.limit - 1);
          const messages: FetchedMessage[] = [];

          for await (const message of client.fetch(`${from}:${ceiling}`, {
            uid: true,
            source: true,
            flags: true,
            internalDate: true,
          })) {
            messages.push({
              uid: message.uid,
              source: message.source,
              flags: flagsOf(message),
              internalDate: message.internalDate ?? null,
            });
          }

          const highest = messages.reduce((seen, message) => Math.max(seen, message.uid), from - 1);
          const resumeAt = messages.length > 0 ? highest + 1 : ceiling + 1;

          return {
            cursor: { path, uidValidity, uidNext: resumeAt },
            messages,
            reachedEnd: ceiling >= state.uidNext - 1,
          } satisfies MailboxFetchPage;
        } finally {
          lock.release();
        }
      });
    },

    async appendToSent(connection, source, path) {
      await withClient(connection, async (client) => {
        const entries = await client.list();
        const sent = path ?? entries.find((entry) => entry.specialUse === "\\Sent")?.path;
        if (!sent) throw new MailboxTransportError(MailboxTransportFailure.folderMissing);

        await client.append(sent, source);
      });
    },
  };
}
