import type { ImapHostRejectionReason } from "./imap-host-guard";

export type MailboxConnection = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  secret: string;
};

export type MailboxFolder = {
  path: string;
  name: string;
  specialUse: string | null;
  subscribed: boolean;
};

export type MailboxFolderCursor = {
  path: string;
  uidValidity: string;
  uidNext: number;
};

export type FetchedMessage = {
  uid: number;
  source: Buffer;
  flags: readonly string[];
  internalDate: Date | null;
};

export type MailboxFetchPage = {
  cursor: MailboxFolderCursor;
  messages: readonly FetchedMessage[];
  reachedEnd: boolean;
};

export const MailboxTransportFailure = {
  hostRejected: "hostRejected",
  unresolvableHost: "unresolvableHost",
  connectionRefused: "connectionRefused",
  connectionTimedOut: "connectionTimedOut",
  tlsFailed: "tlsFailed",
  authenticationFailed: "authenticationFailed",
  folderMissing: "folderMissing",
  protocolFailed: "protocolFailed",
} as const;

export type MailboxTransportFailure = (typeof MailboxTransportFailure)[keyof typeof MailboxTransportFailure];

export class MailboxTransportError extends Error {
  constructor(
    readonly failure: MailboxTransportFailure,
    readonly hostRejection?: ImapHostRejectionReason,
  ) {
    super(failure);
    this.name = "MailboxTransportError";
  }
}

export type MailboxTransport = {
  verify(connection: MailboxConnection): Promise<void>;
  listFolders(connection: MailboxConnection): Promise<readonly MailboxFolder[]>;
  fetchSince(
    connection: MailboxConnection,
    cursor: MailboxFolderCursor | null,
    path: string,
    limit: number,
  ): Promise<MailboxFetchPage>;
  appendToSent(connection: MailboxConnection, source: Buffer, path: string | null): Promise<void>;
};
