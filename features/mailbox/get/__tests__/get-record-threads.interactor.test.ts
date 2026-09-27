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
import { ValidateContactIdsInteractor } from "@/core/validation/validators/validate-contact-ids.interactor";
import { ValidateDealIdsInteractor } from "@/core/validation/validators/validate-deal-ids.interactor";
import { ValidateLeadIdsInteractor } from "@/core/validation/validators/validate-lead-ids.interactor";
import { ValidateOrganizationIdsInteractor } from "@/core/validation/validators/validate-organization-ids.interactor";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { interactorFailureKind, serializeInteractorFailure } from "@/core/validation/validation.utils";

const CONTACT_ID = "00000000-0000-4000-8000-0000000000c1";
const DEAL_ID = "00000000-0000-4000-8000-0000000000d1";
const ORGANIZATION_ID = "00000000-0000-4000-8000-0000000000a1";
const LEAD_ID = "00000000-0000-4000-8000-0000000000b1";
const COLLEAGUE_THREAD_ID = "00000000-0000-4000-8000-0000000000e3";
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
const COLLEAGUE = threadRow(COLLEAGUE_THREAD_ID, new Date("2026-09-05T10:00:00Z"));

function readable(ids: readonly string[]) {
  const allowed = new Set(ids);

  return {
    findIds: vi.fn((requested: Set<string>) =>
      Promise.resolve(new Set([...requested].filter((id) => allowed.has(id)))),
    ),
  } as never;
}

function interactorFor(
  options: {
    matched?: ThreadSummaryRow[];
    linked?: ThreadSummaryRow[];
    sameDomain?: ThreadSummaryRow[];
    identifiers?: string[];
    readableContactIds?: readonly string[];
    readableOrganizationIds?: readonly string[];
    readableLeadIds?: readonly string[];
    readableDealIds?: readonly string[];
  } = {},
) {
  const findContactIdsOnDeal = vi.fn().mockResolvedValue([CONTACT_ID]);
  const findEmailIdentifiersOfContacts = vi.fn().mockResolvedValue(options.identifiers ?? ["anna@buyer.example"]);
  const findContactIdsOfOrganization = vi.fn().mockResolvedValue([CONTACT_ID]);
  const findDealIdsOfOrganization = vi.fn().mockResolvedValue([DEAL_ID]);
  const findContactIdOfLead = vi.fn().mockResolvedValue(CONTACT_ID);
  const findSharedThreadsForDomainsCompanyWide = vi.fn().mockResolvedValue(options.sameDomain ?? []);
  const findThreadsLinkedToDealsCompanyWide = vi.fn().mockResolvedValue(options.linked ?? []);
  const findSharedThreadsForIdentifiersCompanyWide = vi.fn().mockResolvedValue(options.matched ?? [MATCHED]);
  const findThreadsLinkedToDealCompanyWide = vi.fn().mockResolvedValue(options.linked ?? []);
  const readableContactIds = new Set(options.readableContactIds ?? [CONTACT_ID]);
  const findContactIds = vi
    .fn()
    .mockImplementation((ids: Set<string>) =>
      Promise.resolve(new Set([...ids].filter((id) => readableContactIds.has(id)))),
    );

  return {
    interactor: new GetRecordThreadsInteractor(
      {
        findContactIdsOnDeal,
        findContactIdsOfOrganization,
        findDealIdsOfOrganization,
        findContactIdOfLead,
        findEmailIdentifiersOfContacts,
        findSharedThreadsForIdentifiersCompanyWide,
        findSharedThreadsForDomainsCompanyWide,
        findThreadsLinkedToDealCompanyWide,
        findThreadsLinkedToDealsCompanyWide,
      },
      new ValidateContactIdsInteractor({ findIds: findContactIds } as never),
      new ValidateOrganizationIdsInteractor(readable(options.readableOrganizationIds ?? [ORGANIZATION_ID])),
      new ValidateLeadIdsInteractor(readable(options.readableLeadIds ?? [LEAD_ID])),
      new ValidateDealIdsInteractor(readable(options.readableDealIds ?? [DEAL_ID])),
    ),
    findContactIdsOfOrganization,
    findDealIdsOfOrganization,
    findContactIdOfLead,
    findSharedThreadsForDomainsCompanyWide,
    findThreadsLinkedToDealsCompanyWide,
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

  it("refuses a contact the caller cannot read before looking up its shared conversations", async () => {
    const { interactor, findEmailIdentifiersOfContacts, findSharedThreadsForIdentifiersCompanyWide } = interactorFor({
      readableContactIds: [],
    });

    const result = await interactor.invoke({ contactId: CONTACT_ID });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(interactorFailureKind(result.error)).toBe("not_found");
    expect(serializeInteractorFailure(result.error).issues).toEqual([
      expect.objectContaining({ path: ["contactId"], customCode: CustomErrorCode.contactNotFound }),
    ]);
    expect(findEmailIdentifiersOfContacts).not.toHaveBeenCalled();
    expect(findSharedThreadsForIdentifiersCompanyWide).not.toHaveBeenCalled();
  });

  it("answers with nothing when neither a contact nor a deal was asked for", async () => {
    const { interactor, findSharedThreadsForIdentifiersCompanyWide } = interactorFor();

    const result = await interactor.invoke({});

    expect(findSharedThreadsForIdentifiersCompanyWide).not.toHaveBeenCalled();
    expect(result.ok && result.data).toEqual([]);
  });

  it("gathers an organization's conversations from its people, its deals, and colleagues on its own domain", async () => {
    const {
      interactor,
      findSharedThreadsForIdentifiersCompanyWide,
      findSharedThreadsForDomainsCompanyWide,
      findThreadsLinkedToDealsCompanyWide,
    } = interactorFor({
      linked: [LINKED],
      sameDomain: [COLLEAGUE],
      identifiers: ["anna@buyer.example", "anna.private@gmail.com"],
    });

    const result = await interactor.invoke({ organizationId: ORGANIZATION_ID });

    expect(findThreadsLinkedToDealsCompanyWide).toHaveBeenCalledWith([DEAL_ID]);
    expect(findSharedThreadsForIdentifiersCompanyWide).toHaveBeenCalledWith([
      "anna@buyer.example",
      "anna.private@gmail.com",
    ]);
    expect(findSharedThreadsForDomainsCompanyWide).toHaveBeenCalledWith(["buyer.example"]);
    expect(result.ok && result.data.map((thread) => thread.id)).toEqual([
      LINKED_THREAD_ID,
      COLLEAGUE_THREAD_ID,
      MATCHED_THREAD_ID,
    ]);
  });

  it("never widens an organization to a free-mail domain", async () => {
    const { interactor, findSharedThreadsForDomainsCompanyWide } = interactorFor({
      identifiers: ["someone@gmail.com", "other@outlook.com"],
    });

    await interactor.invoke({ organizationId: ORGANIZATION_ID });

    expect(findSharedThreadsForDomainsCompanyWide).not.toHaveBeenCalled();
  });

  it("shows a lead the conversations of its contact, and nothing when it has none", async () => {
    const { interactor, findContactIdOfLead, findSharedThreadsForDomainsCompanyWide } = interactorFor();

    const result = await interactor.invoke({ leadId: LEAD_ID });
    expect(result.ok && result.data.map((thread) => thread.id)).toEqual([MATCHED_THREAD_ID]);
    expect(findSharedThreadsForDomainsCompanyWide).not.toHaveBeenCalled();

    findContactIdOfLead.mockResolvedValue(null);
    const empty = await interactor.invoke({ leadId: LEAD_ID });
    expect(empty.ok && empty.data).toEqual([]);
  });

  it.each([
    ["organizationId", ORGANIZATION_ID, CustomErrorCode.organizationNotFound, { readableOrganizationIds: [] }],
    ["leadId", LEAD_ID, CustomErrorCode.leadNotFound, { readableLeadIds: [] }],
    ["dealId", DEAL_ID, CustomErrorCode.dealNotFound, { readableDealIds: [] }],
  ] as const)("refuses a %s the caller cannot read as not found", async (field, id, customCode, access) => {
    const { interactor, findSharedThreadsForIdentifiersCompanyWide } = interactorFor(access);

    const result = await interactor.invoke({ [field]: id });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(interactorFailureKind(result.error)).toBe("not_found");
    expect(serializeInteractorFailure(result.error).issues).toEqual([
      expect.objectContaining({ path: [field], customCode }),
    ]);
    expect(findSharedThreadsForIdentifiersCompanyWide).not.toHaveBeenCalled();
  });
});
