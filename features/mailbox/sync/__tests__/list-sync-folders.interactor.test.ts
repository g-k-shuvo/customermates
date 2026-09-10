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
import type { MailboxAccount } from "../../persistence/prisma-mailbox.repository";
import type { SyncMailboxService } from "../sync-mailbox.service";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { ListSyncFoldersInteractor } from "../list-sync-folders.interactor";
import { MailboxTransportError, MailboxTransportFailure } from "../mailbox-transport";

const ACCOUNT_ID = "00000000-0000-4000-8000-0000000000b1";

type Issue = { params?: { error?: CustomErrorCode; kind?: string }; path?: (string | number)[] };

function issuesOf(result: InteractorOutcome<unknown>): Issue[] {
  return result.ok ? [] : (result.error.issues as Issue[]);
}

const ACCOUNT: MailboxAccount = {
  connectedAccountId: ACCOUNT_ID,
  emailAddress: "max@vendor.example",
  displayName: "Max",
  imapHost: "imap.mailhost.io",
  imapPort: 993,
  imapSecure: true,
  username: "max@vendor.example",
  sealedSecret: "sealed:secret",
  syncCursors: [],
  backfillFrom: null,
};

function interactorFor(options: { account?: MailboxAccount | null; listSyncFolders?: () => Promise<string[]> } = {}) {
  const getMailboxAccount = vi.fn().mockResolvedValue(options.account === undefined ? ACCOUNT : options.account);
  const listSyncFolders = vi.fn(options.listSyncFolders ?? (() => Promise.resolve(["INBOX", "Sent"])));
  const service = { listSyncFolders } as unknown as SyncMailboxService;

  return {
    interactor: new ListSyncFoldersInteractor({ getMailboxAccount, getMailboxAccounts: vi.fn() }, service),
    getMailboxAccount,
    listSyncFolders,
  };
}

describe("ListSyncFoldersInteractor", () => {
  it("answers with the folders the transport offers for the caller's own mailbox", async () => {
    const { interactor, getMailboxAccount, listSyncFolders } = interactorFor();

    const result = await interactor.invoke({ connectedAccountId: ACCOUNT_ID });

    expect(getMailboxAccount).toHaveBeenCalledWith(ACCOUNT_ID);
    expect(listSyncFolders).toHaveBeenCalledWith(ACCOUNT);
    expect(result.ok && result.data).toEqual(["INBOX", "Sent"]);
  });

  it("reports an instance without a mailbox secret key as unavailable", async () => {
    const interactor = new ListSyncFoldersInteractor({ getMailboxAccount: vi.fn(), getMailboxAccounts: vi.fn() }, null);

    const result = await interactor.invoke({ connectedAccountId: ACCOUNT_ID });

    expect(result.ok).toBe(false);
    expect(issuesOf(result)[0]?.params).toMatchObject({
      error: CustomErrorCode.mailboxSecretKeyMissing,
      kind: "unavailable",
    });
  });

  it("reports a mailbox that is not the caller's own as not found", async () => {
    const { interactor, listSyncFolders } = interactorFor({ account: null });

    const result = await interactor.invoke({ connectedAccountId: ACCOUNT_ID });

    expect(listSyncFolders).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(issuesOf(result)[0]?.params).toMatchObject({
      error: CustomErrorCode.mailboxNotFound,
      kind: "not_found",
    });
    expect(issuesOf(result)[0]?.path).toEqual(["connectedAccountId"]);
  });

  it("returns an unreachable mailbox rather than throwing the transport failure", async () => {
    const { interactor } = interactorFor({
      listSyncFolders: () => Promise.reject(new MailboxTransportError(MailboxTransportFailure.connectionRefused)),
    });

    const result = await interactor.invoke({ connectedAccountId: ACCOUNT_ID });

    expect(result.ok).toBe(false);
    expect(issuesOf(result)[0]?.params?.error).toBe(CustomErrorCode.mailboxUnreachable);
  });

  it("lets an unexpected failure escape instead of reporting it as an unreachable mailbox", async () => {
    const failure = new TypeError("cursor store is corrupt");
    const { interactor } = interactorFor({ listSyncFolders: () => Promise.reject(failure) });

    await expect(interactor.invoke({ connectedAccountId: ACCOUNT_ID })).rejects.toBe(failure);
  });

  it("rejects a mailbox identifier that is not a connected account id", async () => {
    const { interactor, getMailboxAccount } = interactorFor();

    const result = await interactor.invoke({ connectedAccountId: "not-a-uuid" });

    expect(result.ok).toBe(false);
    expect(getMailboxAccount).not.toHaveBeenCalled();
  });
});
