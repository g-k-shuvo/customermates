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

import { GetMailboxThreadsInteractor } from "../get-mailbox-threads.interactor";
import { toMailboxThreadFilter } from "../mailbox-thread-filter";

const THREAD_ID = "00000000-0000-4000-8000-0000000000d1";

const STORED_THREAD = {
  id: THREAD_ID,
  subject: "Quarterly numbers",
  lastMessageAt: new Date("2026-09-08T10:00:00Z"),
  lastMessagePreview: "Here they are",
  lastMessageIsSender: false,
  state: "unread",
  sharedToCrm: false,
  participants: [
    { identifier: "alice@vendor.example", displayName: "Alice", isSelf: false },
    { identifier: "max@vendor.example", displayName: "Max", isSelf: true },
  ],
};

function interactorFor(rows: unknown[] = [STORED_THREAD]) {
  const listThreadsForMailboxes = vi.fn().mockResolvedValue(rows);

  return { interactor: new GetMailboxThreadsInteractor({ listThreadsForMailboxes } as never), listThreadsForMailboxes };
}

describe("toMailboxThreadFilter", () => {
  it("treats a missing query and folder as no filter at all", () => {
    expect(toMailboxThreadFilter({})).toEqual({ search: null, folder: null });
  });

  it("trims the query and drops it when only whitespace was typed", () => {
    expect(toMailboxThreadFilter({ query: "  alice  " })).toEqual({ search: "alice", folder: null });
    expect(toMailboxThreadFilter({ query: "   " })).toEqual({ search: null, folder: null });
  });

  it("keeps a folder path verbatim once trimmed", () => {
    expect(toMailboxThreadFilter({ folder: " INBOX/Archive " })).toEqual({ search: null, folder: "INBOX/Archive" });
  });
});

describe("GetMailboxThreadsInteractor", () => {
  it("asks the repository for everything when no filter is given", async () => {
    const { interactor, listThreadsForMailboxes } = interactorFor();

    const result = await interactor.invoke({});

    expect(listThreadsForMailboxes).toHaveBeenCalledWith(100, { search: null, folder: null });
    expect(result.ok && result.data).toHaveLength(1);
  });

  it("passes the trimmed search term and folder to the repository", async () => {
    const { interactor, listThreadsForMailboxes } = interactorFor();

    const result = await interactor.invoke({ query: "  Quarterly ", folder: "Archive" });

    expect(result.ok).toBe(true);
    expect(listThreadsForMailboxes).toHaveBeenCalledWith(100, { search: "Quarterly", folder: "Archive" });
  });

  it("refuses a search term longer than the bound instead of running it", async () => {
    const { interactor, listThreadsForMailboxes } = interactorFor();

    const result = await interactor.invoke({ query: "x".repeat(201) });

    expect(result.ok).toBe(false);
    expect(listThreadsForMailboxes).not.toHaveBeenCalled();
  });

  it("maps rows to summaries and drops the mailbox owner from the participants", async () => {
    const { interactor } = interactorFor();

    const result = await interactor.invoke({ query: "alice" });

    const [thread] = result.ok ? result.data : [];
    expect(thread?.participants).toEqual([{ identifier: "alice@vendor.example", displayName: "Alice" }]);
    expect(thread?.unread).toBe(true);
  });

  it("returns an empty list when nothing matches the search", async () => {
    const { interactor } = interactorFor([]);

    const result = await interactor.invoke({ query: "nobody" });

    expect(result.ok && result.data).toEqual([]);
  });
});
