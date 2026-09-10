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

import type { GetMailboxFoldersRepo } from "../get-mailbox-folders.interactor";

import { GetMailboxFoldersInteractor } from "../get-mailbox-folders.interactor";

function interactorFor(listStoredMailboxFolders: () => Promise<unknown[]>) {
  const repo = { listStoredMailboxFolders: vi.fn(listStoredMailboxFolders) };

  return { interactor: new GetMailboxFoldersInteractor(repo as unknown as GetMailboxFoldersRepo), repo };
}

describe("GetMailboxFoldersInteractor", () => {
  it("answers with the folders stored for the caller's own mailboxes", async () => {
    const { interactor, repo } = interactorFor(() => Promise.resolve(["INBOX", "INBOX/Clients", "Sent"]));

    const result = await interactor.invoke();

    expect(repo.listStoredMailboxFolders).toHaveBeenCalledOnce();
    expect(result.ok && result.data).toEqual(["INBOX", "INBOX/Clients", "Sent"]);
  });

  it("answers with nothing when the caller has no mailbox connected", async () => {
    const { interactor } = interactorFor(() => Promise.resolve([]));

    const result = await interactor.invoke();

    expect(result.ok && result.data).toEqual([]);
  });

  it("refuses to hand back a folder path that is not a string", async () => {
    const { interactor } = interactorFor(() => Promise.resolve(["INBOX", 7]));

    await expect(interactor.invoke()).rejects.toThrow();
  });

  it("lets a failing folder read escape instead of answering with an empty list", async () => {
    const failure = new Error("cursor store is unreadable");
    const { interactor } = interactorFor(() => Promise.reject(failure));

    await expect(interactor.invoke()).rejects.toBe(failure);
  });
});
