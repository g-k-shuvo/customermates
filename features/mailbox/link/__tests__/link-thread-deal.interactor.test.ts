import { describe, it, expect, vi } from "vitest";

import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

let mockUser = createMockUser();

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

import { Action, Resource } from "@/generated/prisma";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { LinkThreadDealInteractor, type ThreadForDealLinkRow } from "../link-thread-deal.interactor";

const THREAD_ID = "00000000-0000-4000-8000-0000000000e9";
const OTHER_THREAD_ID = "00000000-0000-4000-8000-0000000000ea";
const DEAL_ID = "00000000-0000-4000-8000-0000000000d1";
const SECOND_DEAL_ID = "00000000-0000-4000-8000-0000000000d2";
const CONTACT_ID = "00000000-0000-4000-8000-0000000000c1";

type Issue = { params?: { error?: CustomErrorCode }; path?: (string | number)[] };

function issuesOf(result: InteractorOutcome<unknown>): Issue[] {
  return result.ok ? [] : (result.error.issues as Issue[]);
}

const THREAD: ThreadForDealLinkRow = {
  id: THREAD_ID,
  sharedToCrm: false,
  linkedDealId: null,
  participants: [
    { identifier: "max@vendor.example", isSelf: true },
    { identifier: "anna@buyer.example", isSelf: false },
  ],
};

function interactorFor(
  thread: ThreadForDealLinkRow | null,
  deals: { dealId: string; contactId: string; isOpen: boolean }[],
) {
  const findThreadForDealLink = vi.fn().mockResolvedValue(thread);
  const setThreadDeal = vi.fn().mockResolvedValue(undefined);
  const setThreadShared = vi.fn().mockResolvedValue(undefined);
  const findContactMatches = vi.fn().mockResolvedValue([{ identifier: "anna@buyer.example", contactId: CONTACT_ID }]);
  const findDealCandidates = vi.fn().mockResolvedValue(deals);
  const findDealNames = vi.fn((ids: readonly string[]) =>
    Promise.resolve(ids.map((id) => ({ id, name: id === DEAL_ID ? "Acme renewal" : "Acme expansion" }))),
  );

  return {
    interactor: new LinkThreadDealInteractor({
      findThreadForDealLink,
      setThreadDeal,
      setThreadShared,
      findContactMatches,
      findDealCandidates,
      findDealNames,
    }),
    findThreadForDealLink,
    setThreadDeal,
    setThreadShared,
    findContactMatches,
  };
}

const ONE_OPEN_DEAL = [{ dealId: DEAL_ID, contactId: CONTACT_ID, isOpen: true }];
const TWO_OPEN_DEALS = [
  { dealId: DEAL_ID, contactId: CONTACT_ID, isOpen: true },
  { dealId: SECOND_DEAL_ID, contactId: CONTACT_ID, isOpen: true },
];

describe("LinkThreadDealInteractor", () => {
  it("stores the deal the conversation was offered and names it back", async () => {
    const { interactor, setThreadDeal } = interactorFor(THREAD, ONE_OPEN_DEAL);

    const result = await interactor.invoke({ threadId: THREAD_ID, dealId: DEAL_ID });

    expect(setThreadDeal).toHaveBeenCalledWith(THREAD_ID, DEAL_ID);
    expect(result.ok).toBe(true);
    expect(result.ok && result.data.dealLink).toEqual({
      linkedDealId: DEAL_ID,
      linkedDealName: "Acme renewal",
      offeredDealId: null,
      offeredDealName: null,
      openDealCount: 1,
    });
  });

  it("shares the conversation as part of confirming the link, because the record is where it now shows", async () => {
    const { interactor, setThreadShared } = interactorFor(THREAD, ONE_OPEN_DEAL);

    const result = await interactor.invoke({ threadId: THREAD_ID, dealId: DEAL_ID });

    expect(setThreadShared).toHaveBeenCalledWith(THREAD_ID, true);
    expect(result.ok && result.data.sharedToCrm).toBe(true);
  });

  it("refuses a deal that was never offered because the contact holds several open ones", async () => {
    const { interactor, setThreadDeal } = interactorFor(THREAD, TWO_OPEN_DEALS);

    const result = await interactor.invoke({ threadId: THREAD_ID, dealId: DEAL_ID });

    expect(setThreadDeal).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(issuesOf(result).map((issue) => issue.params?.error)).toContain(CustomErrorCode.mailboxDealNotOffered);
    expect(issuesOf(result).map((issue) => issue.path)).toContainEqual(["dealId"]);
  });

  it("refuses a deal nobody on the conversation is on", async () => {
    const { interactor, setThreadDeal } = interactorFor(THREAD, ONE_OPEN_DEAL);

    const result = await interactor.invoke({ threadId: THREAD_ID, dealId: SECOND_DEAL_ID });

    expect(setThreadDeal).not.toHaveBeenCalled();
    expect(issuesOf(result).map((issue) => issue.params?.error)).toContain(CustomErrorCode.mailboxDealNotOffered);
  });

  it("removes a link without asking whether the deal is still the offered one", async () => {
    const linked = { ...THREAD, sharedToCrm: true, linkedDealId: DEAL_ID };
    const { interactor, setThreadDeal, setThreadShared } = interactorFor(linked, TWO_OPEN_DEALS);

    const result = await interactor.invoke({ threadId: THREAD_ID, dealId: null });

    expect(setThreadDeal).toHaveBeenCalledWith(THREAD_ID, null);
    expect(setThreadShared).not.toHaveBeenCalled();
    expect(result.ok && result.data.dealLink.linkedDealId).toBeNull();
    expect(result.ok && result.data.sharedToCrm).toBe(true);
  });

  it("leaves an already shared conversation shared rather than writing the flag again", async () => {
    const shared = { ...THREAD, sharedToCrm: true };
    const { interactor, setThreadShared } = interactorFor(shared, ONE_OPEN_DEAL);

    await interactor.invoke({ threadId: THREAD_ID, dealId: DEAL_ID });

    expect(setThreadShared).not.toHaveBeenCalled();
  });

  it("reports an unknown conversation as not found and writes nothing", async () => {
    const { interactor, setThreadDeal } = interactorFor(null, ONE_OPEN_DEAL);

    const result = await interactor.invoke({ threadId: OTHER_THREAD_ID, dealId: DEAL_ID });

    expect(setThreadDeal).not.toHaveBeenCalled();
    expect(issuesOf(result).map((issue) => issue.params?.error)).toContain(CustomErrorCode.mailboxThreadNotFound);
    expect(issuesOf(result).map((issue) => issue.path)).toContainEqual(["threadId"]);
  });

  it("rejects an id that is not a uuid before touching the repository", async () => {
    const { interactor, findThreadForDealLink } = interactorFor(THREAD, ONE_OPEN_DEAL);

    const result = await interactor.invoke({ threadId: "not-a-uuid", dealId: null });

    expect(findThreadForDealLink).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });

  it("refuses to link for a person who may edit mail but may not read deals", async () => {
    mockUser = createMockUserWithPermissions([
      { resource: Resource.inboxMessages, action: Action.update },
      { resource: Resource.contacts, action: Action.readAll },
    ]);

    try {
      const { interactor, setThreadDeal } = interactorFor(THREAD, ONE_OPEN_DEAL);

      const result = await interactor.invoke({ threadId: THREAD_ID, dealId: DEAL_ID });

      expect(setThreadDeal).not.toHaveBeenCalled();
      expect(issuesOf(result).map((issue) => issue.params?.error)).toContain(CustomErrorCode.permissionDenied);
    } finally {
      mockUser = createMockUser();
    }
  });

  it("still lets that person remove a link, which needs no deal access", async () => {
    mockUser = createMockUserWithPermissions([{ resource: Resource.inboxMessages, action: Action.update }]);

    try {
      const linked = { ...THREAD, sharedToCrm: true, linkedDealId: DEAL_ID };
      const { interactor, setThreadDeal } = interactorFor(linked, ONE_OPEN_DEAL);

      const result = await interactor.invoke({ threadId: THREAD_ID, dealId: null });

      expect(setThreadDeal).toHaveBeenCalledWith(THREAD_ID, null);
      expect(result.ok).toBe(true);
    } finally {
      mockUser = createMockUser();
    }
  });

  it("never treats the mailbox owner's own open deal as a reason to link", async () => {
    const ownerOnly: ThreadForDealLinkRow = {
      ...THREAD,
      participants: [{ identifier: "max@vendor.example", isSelf: true }],
    };
    const { interactor, findContactMatches, setThreadDeal } = interactorFor(ownerOnly, ONE_OPEN_DEAL);

    const result = await interactor.invoke({ threadId: THREAD_ID, dealId: DEAL_ID });

    expect(findContactMatches).toHaveBeenCalledWith([]);
    expect(setThreadDeal).not.toHaveBeenCalled();
    expect(issuesOf(result).map((issue) => issue.params?.error)).toContain(CustomErrorCode.mailboxDealNotOffered);
  });
});
