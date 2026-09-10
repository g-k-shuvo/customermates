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

import type { ThreadSummaryRow } from "../mailbox-thread-mapper";

import { GetRecordThreadsInteractor } from "../get-record-threads.interactor";

const CONTACT_ID = "00000000-0000-4000-8000-0000000000c1";
const DEAL_ID = "00000000-0000-4000-8000-0000000000d1";
const MATCHED_THREAD_ID = "00000000-0000-4000-8000-0000000000e1";
const LINKED_THREAD_ID = "00000000-0000-4000-8000-0000000000e2";

function threadRow(id: string, lastMessageAt: Date | null): ThreadSummaryRow {
  return {
    id,
    subject: "Quarterly numbers",
    lastMessageAt,
    lastMessagePreview: "Here they are",
    lastMessageIsSender: false,
    state: "open",
    sharedToCrm: true,
    participants: [{ identifier: "anna@buyer.example", displayName: "Anna", isSelf: false }],
  };
}

const MATCHED = threadRow(MATCHED_THREAD_ID, new Date("2026-09-01T10:00:00Z"));
const LINKED = threadRow(LINKED_THREAD_ID, new Date("2026-09-08T10:00:00Z"));

function interactorFor(options: { matched?: ThreadSummaryRow[]; linked?: ThreadSummaryRow[] } = {}) {
  const findContactIdsOnDeal = vi.fn().mockResolvedValue([CONTACT_ID]);
  const findEmailIdentifiersOfContacts = vi.fn().mockResolvedValue(["anna@buyer.example"]);
  const findSharedThreadsForIdentifiersCompanyWide = vi.fn().mockResolvedValue(options.matched ?? [MATCHED]);
  const findThreadsLinkedToDealCompanyWide = vi.fn().mockResolvedValue(options.linked ?? []);

  return {
    interactor: new GetRecordThreadsInteractor({
      findContactIdsOnDeal,
      findEmailIdentifiersOfContacts,
      findSharedThreadsForIdentifiersCompanyWide,
      findThreadsLinkedToDealCompanyWide,
    }),
    findContactIdsOnDeal,
    findEmailIdentifiersOfContacts,
    findSharedThreadsForIdentifiersCompanyWide,
    findThreadsLinkedToDealCompanyWide,
  };
}

describe("GetRecordThreadsInteractor", () => {
  it("derives a contact's conversations from the addresses on the record, sharing them only when shared", async () => {
    const { interactor, findSharedThreadsForIdentifiersCompanyWide, findThreadsLinkedToDealCompanyWide } =
      interactorFor();

    const result = await interactor.invoke({ contactId: CONTACT_ID });

    expect(findSharedThreadsForIdentifiersCompanyWide).toHaveBeenCalledWith(["anna@buyer.example"]);
    expect(findThreadsLinkedToDealCompanyWide).not.toHaveBeenCalled();
    expect(result.ok && result.data.map((thread) => thread.id)).toEqual([MATCHED_THREAD_ID]);
  });

  it("adds the conversations a person confirmed against the deal to the ones its contacts match", async () => {
    const { interactor } = interactorFor({ linked: [LINKED] });

    const result = await interactor.invoke({ dealId: DEAL_ID });

    expect(result.ok && result.data.map((thread) => thread.id)).toEqual([LINKED_THREAD_ID, MATCHED_THREAD_ID]);
  });

  it("shows a conversation once even when it is both linked and matched", async () => {
    const { interactor } = interactorFor({ linked: [MATCHED] });

    const result = await interactor.invoke({ dealId: DEAL_ID });

    expect(result.ok && result.data.map((thread) => thread.id)).toEqual([MATCHED_THREAD_ID]);
  });

  it("still answers with the linked conversations when no contact is left on the deal", async () => {
    const { interactor, findContactIdsOnDeal, findEmailIdentifiersOfContacts } = interactorFor({ linked: [LINKED] });
    findContactIdsOnDeal.mockResolvedValue([]);

    const result = await interactor.invoke({ dealId: DEAL_ID });

    expect(findEmailIdentifiersOfContacts).not.toHaveBeenCalled();
    expect(result.ok && result.data.map((thread) => thread.id)).toEqual([LINKED_THREAD_ID]);
  });

  it("answers with nothing when neither a contact nor a deal was asked for", async () => {
    const { interactor, findSharedThreadsForIdentifiersCompanyWide } = interactorFor();

    const result = await interactor.invoke({});

    expect(findSharedThreadsForIdentifiersCompanyWide).not.toHaveBeenCalled();
    expect(result.ok && result.data).toEqual([]);
  });
});
