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

import { GetMailboxThreadInteractor, type ThreadWithMessagesRow } from "../get-mailbox-thread.interactor";

const THREAD_ID = "00000000-0000-4000-8000-0000000000e9";
const CONTACT_ID = "00000000-0000-4000-8000-0000000000c1";
const DEAL_ID = "00000000-0000-4000-8000-0000000000d1";
const SECOND_DEAL_ID = "00000000-0000-4000-8000-0000000000d2";

function threadRow(linkedDealId: string | null): ThreadWithMessagesRow {
  return {
    id: THREAD_ID,
    subject: "Quarterly numbers",
    lastMessageAt: new Date("2026-09-08T10:00:00Z"),
    lastMessagePreview: "Here they are",
    lastMessageIsSender: false,
    state: "unread",
    sharedToCrm: true,
    linkedDealId,
    participants: [
      { identifier: "max@vendor.example", displayName: "Max", isSelf: true },
      { identifier: "anna@buyer.example", displayName: "Anna", isSelf: false },
    ],
    messages: [
      {
        id: "00000000-0000-4000-8000-0000000000f1",
        subject: "Quarterly numbers",
        bodyText: "The numbers are attached.",
        bodyHtml: null,
        direction: "inbound",
        isDraft: false,
        sentAt: new Date("2026-09-08T10:00:00Z"),
        senderIdentifier: "anna@buyer.example",
      },
    ],
  };
}

function interactorFor(options: {
  linkedDealId?: string | null;
  deals?: { dealId: string; contactId: string; isOpen: boolean }[];
}) {
  const findThreadWithMessages = vi.fn().mockResolvedValue(threadRow(options.linkedDealId ?? null));
  const markThreadRead = vi.fn().mockResolvedValue(undefined);
  const findContactMatches = vi.fn().mockResolvedValue([{ identifier: "anna@buyer.example", contactId: CONTACT_ID }]);
  const findDealCandidates = vi.fn().mockResolvedValue(options.deals ?? []);
  const findDealNames = vi.fn((ids: readonly string[]) =>
    Promise.resolve(ids.map((id) => ({ id, name: id === DEAL_ID ? "Acme renewal" : "Acme expansion" }))),
  );

  return {
    interactor: new GetMailboxThreadInteractor({
      findThreadWithMessages,
      markThreadRead,
      findContactMatches,
      findDealCandidates,
      findDealNames,
    }),
    findContactMatches,
  };
}

const ONE_OPEN_DEAL = [{ dealId: DEAL_ID, contactId: CONTACT_ID, isOpen: true }];
const TWO_OPEN_DEALS = [
  { dealId: DEAL_ID, contactId: CONTACT_ID, isOpen: true },
  { dealId: SECOND_DEAL_ID, contactId: CONTACT_ID, isOpen: true },
];

describe("GetMailboxThreadInteractor deal offer", () => {
  it("offers the deal by name when the matched contact has exactly one open one", async () => {
    const { interactor, findContactMatches } = interactorFor({ deals: ONE_OPEN_DEAL });

    const result = await interactor.invoke({ threadId: THREAD_ID, allowRemoteImages: false });

    expect(findContactMatches).toHaveBeenCalledWith(["anna@buyer.example"]);
    expect(result.ok && result.data.dealLink).toEqual({
      linkedDealId: null,
      linkedDealName: null,
      offeredDealId: DEAL_ID,
      offeredDealName: "Acme renewal",
      openDealCount: 1,
    });
  });

  it("offers nothing but says how many open deals it refused to guess between", async () => {
    const { interactor } = interactorFor({ deals: TWO_OPEN_DEALS });

    const result = await interactor.invoke({ threadId: THREAD_ID, allowRemoteImages: false });

    expect(result.ok && result.data.dealLink.offeredDealId).toBeNull();
    expect(result.ok && result.data.dealLink.openDealCount).toBe(2);
  });

  it("stops offering once a person has confirmed the link", async () => {
    const { interactor } = interactorFor({ linkedDealId: DEAL_ID, deals: ONE_OPEN_DEAL });

    const result = await interactor.invoke({ threadId: THREAD_ID, allowRemoteImages: false });

    expect(result.ok && result.data.dealLink).toEqual({
      linkedDealId: DEAL_ID,
      linkedDealName: "Acme renewal",
      offeredDealId: null,
      offeredDealName: null,
      openDealCount: 1,
    });
  });

  it("ignores a closed deal when deciding what to offer", async () => {
    const { interactor } = interactorFor({ deals: [{ dealId: DEAL_ID, contactId: CONTACT_ID, isOpen: false }] });

    const result = await interactor.invoke({ threadId: THREAD_ID, allowRemoteImages: false });

    expect(result.ok && result.data.dealLink.offeredDealId).toBeNull();
    expect(result.ok && result.data.dealLink.openDealCount).toBe(0);
  });
});
