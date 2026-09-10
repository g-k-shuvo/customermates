import { describe, it, expect, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: (namespace?: string) => {
    const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
    return Promise.resolve(Object.assign(t, { raw: t }));
  },
  getLocale: () => Promise.resolve("en"),
}));

import type { InteractorOutcome } from "@/core/validation/validation.utils";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { MailboxTransportError, MailboxTransportFailure } from "../sync/mailbox-transport";
import { ConnectMailboxInteractor } from "../connect/connect-mailbox.interactor";
import { SyncMailboxInteractor } from "../sync/sync-mailbox.interactor";
import { SendReplyInteractor } from "../outbound/send-reply.interactor";
import { parseSecretBoxKey, sealSecret } from "../credentials/secret-box";

const KEY = parseSecretBoxKey(Buffer.alloc(32, 3).toString("base64"));
const THREAD_ID = "00000000-0000-4000-8000-0000000000a1";
const ACCOUNT_ID = "00000000-0000-4000-8000-0000000000b1";
const NOW = () => new Date("2026-09-07T10:00:00Z");

type Issue = { params?: { error?: CustomErrorCode }; path?: (string | number)[] };

function issuesOf(result: InteractorOutcome<unknown>): Issue[] {
  return result.ok ? [] : (result.error.issues as Issue[]);
}

function errorCodesOf(result: InteractorOutcome<unknown>): (CustomErrorCode | undefined)[] {
  return issuesOf(result).map((issue) => issue.params?.error);
}

const CONNECT_INPUT = {
  emailAddress: "max@vendor.example",
  imapHost: "imap.mailhost.io",
  imapPort: 993,
  imapSecure: true,
  username: "max@vendor.example",
  secret: "app-password",
  backfillDays: 90,
};

function connectRepo(existing: unknown = null) {
  const createMailboxOrThrow = vi.fn();
  const repo = { findMailboxByAddress: vi.fn().mockResolvedValue(existing), createMailboxOrThrow } as never;

  return { repo, createMailboxOrThrow };
}

describe("ConnectMailboxInteractor failures", () => {
  it("refuses to connect when the instance has no mailbox secret key", async () => {
    const interactor = new ConnectMailboxInteractor(connectRepo().repo, { verify: vi.fn() } as never, null, NOW);

    const result = await interactor.invoke(CONNECT_INPUT);

    expect(result.ok).toBe(false);
    expect(errorCodesOf(result)).toContain(CustomErrorCode.mailboxSecretKeyMissing);
  });

  it("reports an address that is already connected as a conflict", async () => {
    const interactor = new ConnectMailboxInteractor(
      connectRepo({ id: "existing" }).repo,
      { verify: vi.fn() } as never,
      KEY,
      NOW,
    );

    const result = await interactor.invoke(CONNECT_INPUT);

    expect(result.ok).toBe(false);
    expect(errorCodesOf(result)).toContain(CustomErrorCode.mailboxAlreadyConnected);
  });

  it("attributes a rejected credential to the secret field", async () => {
    const transport = {
      verify: vi.fn().mockRejectedValue(new MailboxTransportError(MailboxTransportFailure.authenticationFailed)),
    } as never;
    const { repo, createMailboxOrThrow } = connectRepo();
    const interactor = new ConnectMailboxInteractor(repo, transport, KEY, NOW);

    const result = await interactor.invoke(CONNECT_INPUT);

    expect(result.ok).toBe(false);
    expect(errorCodesOf(result)).toContain(CustomErrorCode.mailboxAuthenticationFailed);
    expect(issuesOf(result)[0]?.path).toEqual(["secret"]);
    expect(createMailboxOrThrow).not.toHaveBeenCalled();
  });

  it("attributes a refused host to the host field and never stores the mailbox", async () => {
    const transport = {
      verify: vi.fn().mockRejectedValue(new MailboxTransportError(MailboxTransportFailure.hostRejected)),
    } as never;
    const { repo, createMailboxOrThrow } = connectRepo();
    const interactor = new ConnectMailboxInteractor(repo, transport, KEY, NOW);

    const result = await interactor.invoke(CONNECT_INPUT);

    expect(result.ok).toBe(false);
    expect(errorCodesOf(result)).toContain(CustomErrorCode.mailboxHostRejected);
    expect(issuesOf(result)[0]?.path).toEqual(["imapHost"]);
    expect(createMailboxOrThrow).not.toHaveBeenCalled();
  });

  it("distinguishes a tls problem from a wrong password", async () => {
    const transport = {
      verify: vi.fn().mockRejectedValue(new MailboxTransportError(MailboxTransportFailure.tlsFailed)),
    } as never;
    const interactor = new ConnectMailboxInteractor(connectRepo().repo, transport, KEY, NOW);

    const result = await interactor.invoke(CONNECT_INPUT);

    expect(errorCodesOf(result)).toContain(CustomErrorCode.mailboxTlsFailed);
  });

  it("treats an unrecognised transport error as a protocol failure rather than crashing", async () => {
    const transport = { verify: vi.fn().mockRejectedValue(new Error("something odd")) } as never;
    const interactor = new ConnectMailboxInteractor(connectRepo().repo, transport, KEY, NOW);

    const result = await interactor.invoke(CONNECT_INPUT);

    expect(result.ok).toBe(false);
    expect(errorCodesOf(result)).toContain(CustomErrorCode.mailboxProtocolFailed);
  });
});

describe("SyncMailboxInteractor failures", () => {
  it("reports an unconfigured instance rather than attempting a sync", async () => {
    const getMailboxAccount = vi.fn();
    const repo = { getMailboxAccount, getMailboxAccounts: vi.fn() } as never;
    const interactor = new SyncMailboxInteractor(repo, null);

    const result = await interactor.invoke({ connectedAccountId: ACCOUNT_ID, batchSize: 100 });

    expect(result.ok).toBe(false);
    expect(errorCodesOf(result)).toContain(CustomErrorCode.mailboxSecretKeyMissing);
    expect(getMailboxAccount).not.toHaveBeenCalled();
  });

  it("reports a mailbox that is no longer connected as not found", async () => {
    const repo = { getMailboxAccount: vi.fn().mockResolvedValue(null), getMailboxAccounts: vi.fn() } as never;
    const interactor = new SyncMailboxInteractor(repo, { syncFolder: vi.fn() } as never);

    const result = await interactor.invoke({ connectedAccountId: ACCOUNT_ID, batchSize: 100 });

    expect(result.ok).toBe(false);
    expect(errorCodesOf(result)).toContain(CustomErrorCode.mailboxNotFound);
  });

  it("turns a transport failure into a typed result instead of throwing", async () => {
    const repo = { getMailboxAccount: vi.fn().mockResolvedValue({ connectedAccountId: ACCOUNT_ID }) } as never;
    const service = {
      syncFolder: vi.fn().mockRejectedValue(new MailboxTransportError(MailboxTransportFailure.connectionTimedOut)),
    } as never;
    const interactor = new SyncMailboxInteractor(repo, service);

    const result = await interactor.invoke({ connectedAccountId: ACCOUNT_ID, batchSize: 100 });

    expect(result.ok).toBe(false);
    expect(errorCodesOf(result)).toContain(CustomErrorCode.mailboxUnreachable);
  });

  it("lets an unexpected error escape rather than reporting it as unreachable", async () => {
    const repo = { getMailboxAccount: vi.fn().mockResolvedValue({ connectedAccountId: ACCOUNT_ID }) } as never;
    const service = { syncFolder: vi.fn().mockRejectedValue(new Error("bug")) } as never;
    const interactor = new SyncMailboxInteractor(repo, service);

    await expect(interactor.invoke({ connectedAccountId: ACCOUNT_ID, batchSize: 100 })).rejects.toThrow("bug");
  });
});

function replyContext(overrides: Record<string, unknown> = {}) {
  return {
    thread: {
      id: THREAD_ID,
      subject: "Renewal",
      unipileThreadId: "imap:thread:root@buyer.example",
      connectedAccountId: ACCOUNT_ID,
      messages: [
        {
          unipileMessageId: "imap:msg:id:root@buyer.example",
          subject: "Renewal",
          senderIdentifier: "anna@buyer.example",
          recipients: { to: [{ identifier: "max@vendor.example" }], cc: [] },
          direction: "inbound",
        },
      ],
    },
    credential: {
      imapHost: "imap.mailhost.io",
      imapPort: 993,
      imapSecure: true,
      smtpHost: "smtp.mailhost.io",
      smtpPort: 587,
      smtpSecure: false,
      username: "max@vendor.example",
      sealedSecret: "sealed",
      connectedAccount: { emailAddress: "max@vendor.example", displayName: "Max" },
      ...(overrides.credential as object satisfies object),
    },
    ...overrides,
  };
}

describe("SendReplyInteractor failures", () => {
  const body = { threadId: THREAD_ID, body: "hello", replyAll: false };

  it("refuses to reply when the instance has no mailbox secret key", async () => {
    const findReplyContext = vi.fn();
    const repo = { findReplyContext, storeOutboundReply: vi.fn() } as never;
    const interactor = new SendReplyInteractor(repo, { send: vi.fn() } as never, null, NOW);

    const result = await interactor.invoke(body);

    expect(result.ok).toBe(false);
    expect(errorCodesOf(result)).toContain(CustomErrorCode.mailboxSecretKeyMissing);
    expect(findReplyContext).not.toHaveBeenCalled();
  });

  it("reports a missing conversation as not found", async () => {
    const repo = { findReplyContext: vi.fn().mockResolvedValue(null), storeOutboundReply: vi.fn() } as never;
    const interactor = new SendReplyInteractor(repo, { send: vi.fn() } as never, KEY, NOW);

    const result = await interactor.invoke(body);

    expect(result.ok).toBe(false);
    expect(errorCodesOf(result)).toContain(CustomErrorCode.mailboxThreadNotFound);
  });

  it("reports an smtp host the guard refuses at send time instead of throwing", async () => {
    const storeOutboundReply = vi.fn();
    const context = replyContext();
    context.credential.sealedSecret = sealSecret(KEY, "app-password");
    const repo = { findReplyContext: vi.fn().mockResolvedValue(context), storeOutboundReply } as never;
    const send = vi.fn().mockRejectedValue(new MailboxTransportError(MailboxTransportFailure.hostRejected));
    const interactor = new SendReplyInteractor(repo, { send } as never, KEY, NOW);

    const result = await interactor.invoke(body);

    expect(result.ok).toBe(false);
    expect(errorCodesOf(result)).toContain(CustomErrorCode.mailboxHostRejected);
    expect(storeOutboundReply).not.toHaveBeenCalled();
  });

  it("sends and appends outside a write transaction, so a slow server holds no company lock", async () => {
    const context = replyContext();
    context.credential.sealedSecret = sealSecret(KEY, "app-password");
    const storeOutboundReply = vi.fn().mockResolvedValue(undefined);
    const repo = { findReplyContext: vi.fn().mockResolvedValue(context), storeOutboundReply } as never;
    const send = vi.fn().mockResolvedValue({
      messageId: "<sent@vendor.example>",
      raw: Buffer.from(""),
      recipients: ["anna@buyer.example"],
    });
    const interactor = new SendReplyInteractor(repo, { send } as never, KEY, NOW);
    MOCK_PRISMA_DB_MODULE.prisma.$transaction.mockClear();

    const result = await interactor.invoke(body);

    expect(result.ok).toBe(true);
    expect(send).toHaveBeenCalled();
    expect(storeOutboundReply).toHaveBeenCalled();
    expect(MOCK_PRISMA_DB_MODULE.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses to send when the mailbox has no outgoing server", async () => {
    const context = replyContext({ credential: { smtpHost: null, smtpPort: null } });
    const repo = { findReplyContext: vi.fn().mockResolvedValue(context), storeOutboundReply: vi.fn() } as never;
    const send = vi.fn();
    const interactor = new SendReplyInteractor(repo, { send } as never, KEY, NOW);

    const result = await interactor.invoke(body);

    expect(result.ok).toBe(false);
    expect(errorCodesOf(result)).toContain(CustomErrorCode.mailboxSendingNotConfigured);
    expect(send).not.toHaveBeenCalled();
  });
});
