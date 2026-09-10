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

import { GetMailboxAccountsInteractor } from "../get-mailbox-accounts.interactor";

const MAILBOX_ID = "00000000-0000-4000-8000-0000000000c1";
const ACCOUNT_ID = "00000000-0000-4000-8000-0000000000c2";

const STORED_MAILBOX = {
  id: MAILBOX_ID,
  connectedAccountId: ACCOUNT_ID,
  emailAddress: "max@vendor.example",
  displayName: "Max",
  imapHost: "imap.mailhost.io",
  imapPort: 993,
  imapSecure: true,
  username: "max@vendor.example",
  smtpHost: "smtp.mailhost.io",
  smtpPort: 587,
  smtpSecure: false,
  syncCursors: [],
  backfillFrom: new Date("2026-06-09T10:00:00Z"),
  lastSyncedAt: new Date("2026-09-07T10:00:00Z"),
  lastVerifiedAt: new Date("2026-09-07T09:00:00Z"),
};

function interactorFor(mailboxes: unknown[]) {
  const listConnectedMailboxes = vi.fn().mockResolvedValue(mailboxes);

  return {
    interactor: new GetMailboxAccountsInteractor({ listConnectedMailboxes } as never),
    listConnectedMailboxes,
  };
}

describe("GetMailboxAccountsInteractor", () => {
  it("returns every connected mailbox of the company", async () => {
    const { interactor, listConnectedMailboxes } = interactorFor([STORED_MAILBOX]);

    const result = await interactor.invoke();

    expect(listConnectedMailboxes).toHaveBeenCalledOnce();
    expect(result.ok).toBe(true);
    expect(result.ok && result.data).toEqual([STORED_MAILBOX]);
  });

  it("returns an empty list when no mailbox is connected", async () => {
    const { interactor } = interactorFor([]);

    const result = await interactor.invoke();

    expect(result.ok && result.data).toEqual([]);
  });

  it("never lets the sealed secret reach the caller", async () => {
    const { interactor } = interactorFor([{ ...STORED_MAILBOX, sealedSecret: "sealed:not-for-the-client" }]);

    const result = await interactor.invoke();

    expect(result.ok).toBe(true);
    const [mailbox] = result.ok ? result.data : [];
    expect(mailbox).not.toHaveProperty("sealedSecret");
    expect(JSON.stringify(result)).not.toContain("sealed:not-for-the-client");
  });
});
