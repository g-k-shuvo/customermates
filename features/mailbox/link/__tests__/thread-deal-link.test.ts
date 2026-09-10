import { describe, expect, it, vi } from "vitest";

import type { ContactMatch, DealCandidate, ParticipantIdentity } from "../thread-links";

import { loadThreadDealLink, resolveThreadDealLink } from "../thread-deal-link";
import { counterpartAddresses, toParticipantIdentities } from "../thread-links";

const SELF: ParticipantIdentity = { identifier: "max@vendor.example", isSelf: true };
const ANNA: ParticipantIdentity = { identifier: "anna@buyer.example", isSelf: false };

const ANNA_MATCH: ContactMatch = { identifier: "anna@buyer.example", contactId: "contact-anna" };
const OPEN: DealCandidate = { dealId: "deal-1", contactId: "contact-anna", isOpen: true };
const SECOND_OPEN: DealCandidate = { dealId: "deal-2", contactId: "contact-anna", isOpen: true };

const NAMES = [
  { id: "deal-1", name: "Acme renewal" },
  { id: "deal-2", name: "Acme expansion" },
];

describe("toParticipantIdentities", () => {
  it("drops a stored participant that never had an address", () => {
    expect(
      toParticipantIdentities([
        { identifier: null, isSelf: false },
        { identifier: "anna@buyer.example", isSelf: false },
      ]),
    ).toEqual([ANNA]);
  });
});

describe("counterpartAddresses", () => {
  it("hands the repository only the addresses that are not the mailbox owner's", () => {
    expect(counterpartAddresses([SELF, ANNA])).toEqual(["anna@buyer.example"]);
  });

  it("normalises case and spacing so the identifier join can be exact", () => {
    expect(counterpartAddresses([{ identifier: "  Anna@Buyer.Example ", isSelf: false }])).toEqual([
      "anna@buyer.example",
    ]);
  });
});

describe("resolveThreadDealLink", () => {
  it("names the single open deal it offers", () => {
    expect(resolveThreadDealLink(null, [SELF, ANNA], [ANNA_MATCH], [OPEN], NAMES)).toEqual({
      linkedDealId: null,
      linkedDealName: null,
      offeredDealId: "deal-1",
      offeredDealName: "Acme renewal",
      openDealCount: 1,
    });
  });

  it("offers nothing across several open deals but still counts them", () => {
    expect(resolveThreadDealLink(null, [SELF, ANNA], [ANNA_MATCH], [OPEN, SECOND_OPEN], NAMES)).toEqual({
      linkedDealId: null,
      linkedDealName: null,
      offeredDealId: null,
      offeredDealName: null,
      openDealCount: 2,
    });
  });

  it("stops offering anything once a deal is linked", () => {
    const link = resolveThreadDealLink("deal-1", [SELF, ANNA], [ANNA_MATCH], [OPEN], NAMES);

    expect(link.linkedDealName).toBe("Acme renewal");
    expect(link.offeredDealId).toBeNull();
  });

  it("keeps the link usable when the deal name can no longer be read", () => {
    const link = resolveThreadDealLink("deal-1", [SELF, ANNA], [ANNA_MATCH], [OPEN], []);

    expect(link.linkedDealId).toBe("deal-1");
    expect(link.linkedDealName).toBeNull();
  });
});

describe("loadThreadDealLink", () => {
  it("asks only for the names it will actually show", async () => {
    const findDealNames = vi.fn().mockResolvedValue(NAMES);
    const repo = {
      findContactMatches: vi.fn().mockResolvedValue([ANNA_MATCH]),
      findDealCandidates: vi.fn().mockResolvedValue([OPEN, SECOND_OPEN]),
      findDealNames,
    };

    const link = await loadThreadDealLink(repo, null, [SELF, ANNA]);

    expect(findDealNames).not.toHaveBeenCalled();
    expect(link.openDealCount).toBe(2);
    expect(link.offeredDealId).toBeNull();
  });

  it("looks up both the linked deal and the offered one in a single call", async () => {
    const findDealNames = vi.fn().mockResolvedValue(NAMES);
    const repo = {
      findContactMatches: vi.fn().mockResolvedValue([ANNA_MATCH]),
      findDealCandidates: vi.fn().mockResolvedValue([OPEN]),
      findDealNames,
    };

    await loadThreadDealLink(repo, "deal-2", [SELF, ANNA]);

    expect(findDealNames).toHaveBeenCalledWith(["deal-2", "deal-1"]);
  });
});
