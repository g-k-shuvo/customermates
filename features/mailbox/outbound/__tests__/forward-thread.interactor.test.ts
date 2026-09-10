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
import { MailboxTransportError, MailboxTransportFailure } from "../../sync/mailbox-transport";
import { ForwardThreadInteractor } from "../forward-thread.interactor";
import { parseSecretBoxKey, sealSecret } from "../../credentials/secret-box";

const KEY = parseSecretBoxKey(Buffer.alloc(32, 7).toString("base64"));
const THREAD_ID = "00000000-0000-4000-8000-0000000000f1";
const ACCOUNT_ID = "00000000-0000-4000-8000-0000000000f2";
const NOW = () => new Date("2026-09-10T10:00:00Z");

type Issue = { params?: { error?: CustomErrorCode } };

function errorCodesOf(result: InteractorOutcome<unknown>): (CustomErrorCode | undefined)[] {
  return result.ok ? [] : (result.error.issues as Issue[]).map((issue) => issue.params?.error);
}

function context(overrides: { smtpHost?: string | null; smtpPort?: number | null } = {}) {
  return {
    thread: {
      id: THREAD_ID,
      subject: "Quarterly numbers",
      connectedAccountId: ACCOUNT_ID,
      messages: [
        {
          subject: "Quarterly numbers",
          sender: { identifier: "alice@vendor.example", displayName: "Alice Vendor" },
          senderIdentifier: "alice@vendor.example",
          recipients: { to: [{ identifier: "max@agency.example" }], cc: [] },
          bodyText: "Numbers attached.",
          sentAt: new Date("2026-09-01T09:15:00Z"),
        },
      ],
    },
    credential: {
      imapHost: "imap.mailhost.io",
      imapPort: 993,
      imapSecure: true,
      smtpHost: overrides.smtpHost === undefined ? "smtp.mailhost.io" : overrides.smtpHost,
      smtpPort: overrides.smtpPort === undefined ? 587 : overrides.smtpPort,
      smtpSecure: false,
      username: "max@agency.example",
      sealedSecret: sealSecret(KEY, "app-password"),
      connectedAccount: { emailAddress: "max@agency.example", displayName: "Max" },
    },
  };
}

function harness(found: unknown = context(), secretKey: typeof KEY | null = KEY) {
  const findReplyContext = vi.fn().mockResolvedValue(found);
  const storeOutboundReply = vi.fn().mockResolvedValue(undefined);
  const send = vi.fn().mockResolvedValue({
    messageId: "<sent@agency.example>",
    raw: Buffer.from(""),
    recipients: ["carol@partner.example"],
  });

  return {
    interactor: new ForwardThreadInteractor(
      { findReplyContext, storeOutboundReply } as never,
      { send } as never,
      secretKey,
      NOW,
    ),
    findReplyContext,
    storeOutboundReply,
    send,
  };
}

describe("ForwardThreadInteractor", () => {
  it("forwards the latest message to the addresses given, without threading it onto the original", async () => {
    const { interactor, send } = harness();

    const result = await interactor.invoke({ threadId: THREAD_ID, to: ["carol@partner.example"], body: "FYI" });

    expect(result.ok).toBe(true);
    const [delivery, forward] = send.mock.calls[0];
    expect(delivery).toEqual(expect.objectContaining({ host: "smtp.mailhost.io", port: 587 }));
    expect(forward.to).toEqual(["carol@partner.example"]);
    expect(forward.subject).toBe("Fwd: Quarterly numbers");
    expect(forward.inReplyTo).toBeNull();
    expect(forward.references).toEqual([]);
    expect(forward.text).toContain("From: Alice Vendor <alice@vendor.example>");
    expect(forward.text).toContain("Numbers attached.");
  });

  it("records the forwarded copy on the conversation it came from", async () => {
    const { interactor, storeOutboundReply } = harness();

    await interactor.invoke({ threadId: THREAD_ID, to: ["carol@partner.example"], body: "FYI" });

    expect(storeOutboundReply).toHaveBeenCalledWith(
      expect.objectContaining({
        messagingThreadId: THREAD_ID,
        connectedAccountId: ACCOUNT_ID,
        subject: "Fwd: Quarterly numbers",
        recipients: ["carol@partner.example"],
        sentAt: NOW(),
      }),
    );
  });

  it("sends outside a write transaction, so a slow smtp server holds no company lock", async () => {
    const { interactor, send, storeOutboundReply } = harness();
    MOCK_PRISMA_DB_MODULE.prisma.$transaction.mockClear();

    const result = await interactor.invoke({ threadId: THREAD_ID, to: ["carol@partner.example"], body: "FYI" });

    expect(result.ok).toBe(true);
    expect(send).toHaveBeenCalled();
    expect(storeOutboundReply).toHaveBeenCalled();
    expect(MOCK_PRISMA_DB_MODULE.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses an address that is not an email address before anything is sent", async () => {
    const { interactor, send } = harness();

    const result = await interactor.invoke({ threadId: THREAD_ID, to: ["not-an-address"], body: "" });

    expect(result.ok).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses an empty recipient list", async () => {
    const { interactor, send } = harness();

    const result = await interactor.invoke({ threadId: THREAD_ID, to: [], body: "" });

    expect(result.ok).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("reports a mailbox without outgoing settings as unavailable", async () => {
    const { interactor, send } = harness(context({ smtpHost: null, smtpPort: null }));

    const result = await interactor.invoke({ threadId: THREAD_ID, to: ["carol@partner.example"], body: "" });

    expect(errorCodesOf(result)).toContain(CustomErrorCode.mailboxSendingNotConfigured);
    expect(send).not.toHaveBeenCalled();
  });

  it("reports an unknown conversation as not found", async () => {
    const { interactor } = harness(null);

    const result = await interactor.invoke({ threadId: THREAD_ID, to: ["carol@partner.example"], body: "" });

    expect(errorCodesOf(result)).toContain(CustomErrorCode.mailboxThreadNotFound);
  });

  it("reports an smtp host the guard refuses at send time instead of throwing", async () => {
    const { interactor, send, storeOutboundReply } = harness();
    send.mockRejectedValue(new MailboxTransportError(MailboxTransportFailure.hostRejected, "privateAddress"));

    const result = await interactor.invoke({ threadId: THREAD_ID, to: ["carol@partner.example"], body: "FYI" });

    expect(result.ok).toBe(false);
    expect(errorCodesOf(result)).toContain(CustomErrorCode.mailboxHostRejected);
    expect(storeOutboundReply).not.toHaveBeenCalled();
  });

  it("refuses to forward when the instance has no mailbox secret key", async () => {
    const { interactor } = harness(context(), null);

    const result = await interactor.invoke({ threadId: THREAD_ID, to: ["carol@partner.example"], body: "" });

    expect(errorCodesOf(result)).toContain(CustomErrorCode.mailboxSecretKeyMissing);
  });
});
