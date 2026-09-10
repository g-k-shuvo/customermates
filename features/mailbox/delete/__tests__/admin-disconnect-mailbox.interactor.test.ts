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
import { AdminDisconnectMailboxInteractor } from "../admin-disconnect-mailbox.interactor";

const ACCOUNT_ID = "00000000-0000-4000-8000-0000000000d1";

type Issue = { params?: { error?: CustomErrorCode }; path?: (string | number)[] };

function issuesOf(result: InteractorOutcome<unknown>): Issue[] {
  return result.ok ? [] : (result.error.issues as Issue[]);
}

function interactorFor(existing: unknown) {
  const findConnectedMailboxCompanyWide = vi.fn().mockResolvedValue(existing);
  const deleteConnectedMailboxCompanyWide = vi.fn().mockResolvedValue(undefined);

  return {
    interactor: new AdminDisconnectMailboxInteractor({
      findConnectedMailboxCompanyWide,
      deleteConnectedMailboxCompanyWide,
    } as never),
    findConnectedMailboxCompanyWide,
    deleteConnectedMailboxCompanyWide,
  };
}

describe("AdminDisconnectMailboxInteractor", () => {
  it("removes a mailbox owned by another member and answers with its id", async () => {
    const { interactor, deleteConnectedMailboxCompanyWide } = interactorFor({ connectedAccountId: ACCOUNT_ID });

    const result = await interactor.invoke({ connectedAccountId: ACCOUNT_ID });

    expect(deleteConnectedMailboxCompanyWide).toHaveBeenCalledWith(ACCOUNT_ID);
    expect(result.ok).toBe(true);
    expect(result.ok && result.data).toBe(ACCOUNT_ID);
  });

  it("reports an unknown mailbox as not found and deletes nothing", async () => {
    const { interactor, deleteConnectedMailboxCompanyWide } = interactorFor(null);

    const result = await interactor.invoke({ connectedAccountId: ACCOUNT_ID });

    expect(deleteConnectedMailboxCompanyWide).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(issuesOf(result).map((issue) => issue.params?.error)).toContain(CustomErrorCode.mailboxNotFound);
    expect(issuesOf(result).map((issue) => issue.path)).toContainEqual(["connectedAccountId"]);
  });

  it("rejects an id that is not a uuid before touching the repository", async () => {
    const { interactor, findConnectedMailboxCompanyWide } = interactorFor({ connectedAccountId: ACCOUNT_ID });

    const result = await interactor.invoke({ connectedAccountId: "not-a-uuid" });

    expect(findConnectedMailboxCompanyWide).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });
});
