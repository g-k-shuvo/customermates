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
import { ConnectMailboxInteractor } from "../connect-mailbox.interactor";
import { parseSecretBoxKey } from "../../credentials/secret-box";
import { MAILBOX_SMTP_IMPLICIT_TLS_PORT, MAILBOX_SMTP_STARTTLS_PORT, resolveSmtpSettings } from "../smtp-settings";

type Issue = { params?: { error?: CustomErrorCode }; path?: (string | number)[] };

function issuesOf(result: InteractorOutcome<unknown>): Issue[] {
  return result.ok ? [] : (result.error.issues as Issue[]);
}

const KEY = parseSecretBoxKey(Buffer.alloc(32, 3).toString("base64"));
const NOW = () => new Date("2026-09-07T10:00:00Z");

const CONNECT_INPUT = {
  emailAddress: "max@vendor.example",
  imapHost: "imap.mailhost.io",
  imapPort: 993,
  imapSecure: true,
  username: "max@vendor.example",
  secret: "app-password",
  backfillDays: 90,
};

function connectHarness(allowPrivateHosts = false) {
  const createMailboxOrThrow = vi.fn().mockImplementation((args: { emailAddress: string }) =>
    Promise.resolve({
      id: "00000000-0000-4000-8000-0000000000c1",
      connectedAccountId: "00000000-0000-4000-8000-0000000000c2",
      imapHost: "imap.mailhost.io",
      imapPort: 993,
      imapSecure: true,
      username: args.emailAddress,
      syncCursors: [],
      backfillFrom: new Date("2026-06-09T10:00:00Z"),
      lastSyncedAt: null,
      lastVerifiedAt: NOW(),
    }),
  );
  const repo = { findMailboxByAddress: vi.fn().mockResolvedValue(null), createMailboxOrThrow } as never;
  const verify = vi.fn().mockResolvedValue(undefined);

  return {
    interactor: new ConnectMailboxInteractor(repo, { verify } as never, KEY, NOW, allowPrivateHosts),
    createMailboxOrThrow,
    verify,
  };
}

describe("resolveSmtpSettings", () => {
  it("stores nothing outbound for a receive-only mailbox", () => {
    expect(resolveSmtpSettings({ smtpHost: undefined, smtpPort: undefined, smtpSecure: undefined })).toEqual({
      smtpHost: null,
      smtpPort: null,
      smtpSecure: null,
    });
  });

  it("ignores a port and a tls flag that arrive without a host", () => {
    expect(resolveSmtpSettings({ smtpHost: undefined, smtpPort: 2525, smtpSecure: true })).toEqual({
      smtpHost: null,
      smtpPort: null,
      smtpSecure: null,
    });
  });

  it("defaults a host without a port to the starttls submission port", () => {
    expect(resolveSmtpSettings({ smtpHost: "smtp.mailhost.io", smtpPort: undefined, smtpSecure: undefined })).toEqual({
      smtpHost: "smtp.mailhost.io",
      smtpPort: MAILBOX_SMTP_STARTTLS_PORT,
      smtpSecure: false,
    });
  });

  it("defaults an implicit-tls host to the implicit-tls port", () => {
    expect(resolveSmtpSettings({ smtpHost: "smtp.mailhost.io", smtpPort: undefined, smtpSecure: true })).toEqual({
      smtpHost: "smtp.mailhost.io",
      smtpPort: MAILBOX_SMTP_IMPLICIT_TLS_PORT,
      smtpSecure: true,
    });
  });

  it("keeps a port the operator chose", () => {
    expect(resolveSmtpSettings({ smtpHost: "smtp.mailhost.io", smtpPort: 2525, smtpSecure: false })).toEqual({
      smtpHost: "smtp.mailhost.io",
      smtpPort: 2525,
      smtpSecure: false,
    });
  });
});

describe("ConnectMailboxInteractor outbound settings", () => {
  it("carries the submitted smtp settings through to the stored mailbox", async () => {
    const { interactor, createMailboxOrThrow } = connectHarness();

    const result = await interactor.invoke({
      ...CONNECT_INPUT,
      smtpHost: "smtp.mailhost.io",
      smtpPort: 2525,
      smtpSecure: true,
    });

    expect(result.ok).toBe(true);
    expect(createMailboxOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ smtpHost: "smtp.mailhost.io", smtpPort: 2525, smtpSecure: true }),
    );
  });

  it("completes the smtp port when only a host was submitted", async () => {
    const { interactor, createMailboxOrThrow } = connectHarness();

    await interactor.invoke({ ...CONNECT_INPUT, smtpHost: "smtp.mailhost.io" });

    expect(createMailboxOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        smtpHost: "smtp.mailhost.io",
        smtpPort: MAILBOX_SMTP_STARTTLS_PORT,
        smtpSecure: false,
      }),
    );
  });

  it("stores nulls for a mailbox connected for reading only", async () => {
    const { interactor, createMailboxOrThrow } = connectHarness();

    const result = await interactor.invoke(CONNECT_INPUT);

    expect(result.ok).toBe(true);
    expect(createMailboxOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ smtpHost: null, smtpPort: null, smtpSecure: null }),
    );
  });

  it("refuses a private-range smtp host, attributing it to the smtp field, before dialling or storing anything", async () => {
    const { interactor, createMailboxOrThrow, verify } = connectHarness();

    const result = await interactor.invoke({ ...CONNECT_INPUT, smtpHost: "10.0.0.5" });

    expect(result.ok).toBe(false);
    expect(issuesOf(result)[0]?.params?.error).toBe(CustomErrorCode.mailboxHostRejected);
    expect(issuesOf(result)[0]?.path).toEqual(["smtpHost"]);
    expect(verify).not.toHaveBeenCalled();
    expect(createMailboxOrThrow).not.toHaveBeenCalled();
  });

  it("refuses loopback, the cloud metadata address and an internal name as smtp hosts", async () => {
    for (const smtpHost of ["127.0.0.1", "localhost", "169.254.169.254", "mail.internal", "0177.0.0.1"]) {
      const { interactor, createMailboxOrThrow } = connectHarness();

      const result = await interactor.invoke({ ...CONNECT_INPUT, smtpHost });

      expect(result.ok, smtpHost).toBe(false);
      expect(issuesOf(result)[0]?.params?.error).toBe(CustomErrorCode.mailboxHostRejected);
      expect(createMailboxOrThrow).not.toHaveBeenCalled();
    }
  });

  it("accepts a private smtp host only when the environment allowed it for the whole instance", async () => {
    const { interactor, createMailboxOrThrow } = connectHarness(true);

    const result = await interactor.invoke({ ...CONNECT_INPUT, smtpHost: "127.0.0.1", smtpPort: 3025 });

    expect(result.ok).toBe(true);
    expect(createMailboxOrThrow).toHaveBeenCalledWith(expect.objectContaining({ smtpHost: "127.0.0.1" }));
  });

  it("bounds the backfill by the requested number of days", async () => {
    const { interactor, createMailboxOrThrow } = connectHarness();

    await interactor.invoke({ ...CONNECT_INPUT, backfillDays: 30 });

    expect(createMailboxOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ backfillFrom: new Date("2026-08-08T10:00:00Z") }),
    );
  });
});
