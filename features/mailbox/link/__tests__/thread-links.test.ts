import { describe, expect, it } from "vitest";

import { planThreadLinks, type ContactMatch, type DealCandidate, type ParticipantIdentity } from "../thread-links";

const SELF: ParticipantIdentity = { identifier: "max@vendor.example", isSelf: true };
const ANNA: ParticipantIdentity = { identifier: "anna@buyer.example", isSelf: false };
const BEN: ParticipantIdentity = { identifier: "ben@buyer.example", isSelf: false };

const ANNA_MATCH: ContactMatch = { identifier: "anna@buyer.example", contactId: "contact-anna" };
const BEN_MATCH: ContactMatch = { identifier: "ben@buyer.example", contactId: "contact-ben" };

function openDeal(dealId: string, contactId: string): DealCandidate {
  return { dealId, contactId, isOpen: true };
}

describe("planThreadLinks", () => {
  it("links a thread to the contact behind a counterpart address", () => {
    const plan = planThreadLinks([SELF, ANNA], [ANNA_MATCH], []);

    expect(plan.contactIds).toEqual(["contact-anna"]);
  });

  it("never links the mailbox owner to themselves", () => {
    const selfMatch: ContactMatch = { identifier: "max@vendor.example", contactId: "contact-max" };

    const plan = planThreadLinks([SELF, ANNA], [selfMatch, ANNA_MATCH], []);

    expect(plan.contactIds).toEqual(["contact-anna"]);
  });

  it("ignores a matched address nobody in the thread actually used", () => {
    const strayMatch: ContactMatch = { identifier: "someone@else.example", contactId: "contact-stray" };

    const plan = planThreadLinks([SELF, ANNA], [ANNA_MATCH, strayMatch], []);

    expect(plan.contactIds).toEqual(["contact-anna"]);
  });

  it("matches an address regardless of the case it was written in", () => {
    const shouty: ParticipantIdentity = { identifier: "  Anna@Buyer.Example  ", isSelf: false };

    const plan = planThreadLinks([SELF, shouty], [ANNA_MATCH], []);

    expect(plan.contactIds).toEqual(["contact-anna"]);
  });

  it("links every recognised counterpart on a group thread", () => {
    const plan = planThreadLinks([SELF, ANNA, BEN], [ANNA_MATCH, BEN_MATCH], []);

    expect(plan.contactIds).toEqual(["contact-anna", "contact-ben"]);
  });

  it("offers the deal when a matched contact has exactly one open deal", () => {
    const plan = planThreadLinks([SELF, ANNA], [ANNA_MATCH], [openDeal("deal-1", "contact-anna")]);

    expect(plan.dealId).toBe("deal-1");
    expect(plan.dealChoices).toEqual(["deal-1"]);
  });

  it("refuses to guess when a contact has several open deals", () => {
    const plan = planThreadLinks(
      [SELF, ANNA],
      [ANNA_MATCH],
      [openDeal("deal-1", "contact-anna"), openDeal("deal-2", "contact-anna")],
    );

    expect(plan.dealId).toBeNull();
    expect(plan.dealChoices).toEqual(["deal-1", "deal-2"]);
  });

  it("ignores closed deals when deciding", () => {
    const plan = planThreadLinks(
      [SELF, ANNA],
      [ANNA_MATCH],
      [openDeal("deal-1", "contact-anna"), { dealId: "deal-old", contactId: "contact-anna", isOpen: false }],
    );

    expect(plan.dealId).toBe("deal-1");
  });

  it("refuses to guess across two contacts each holding a different open deal", () => {
    const plan = planThreadLinks(
      [SELF, ANNA, BEN],
      [ANNA_MATCH, BEN_MATCH],
      [openDeal("deal-1", "contact-anna"), openDeal("deal-2", "contact-ben")],
    );

    expect(plan.dealId).toBeNull();
    expect(plan.dealChoices).toEqual(["deal-1", "deal-2"]);
  });

  it("still offers a single deal two matched contacts share", () => {
    const plan = planThreadLinks(
      [SELF, ANNA, BEN],
      [ANNA_MATCH, BEN_MATCH],
      [openDeal("deal-1", "contact-anna"), openDeal("deal-1", "contact-ben")],
    );

    expect(plan.dealId).toBe("deal-1");
  });

  it("ignores a deal belonging to a contact not on the thread", () => {
    const plan = planThreadLinks([SELF, ANNA], [ANNA_MATCH], [openDeal("deal-x", "contact-stranger")]);

    expect(plan.dealId).toBeNull();
    expect(plan.dealChoices).toEqual([]);
  });

  it("links nothing when no counterpart is a known contact", () => {
    const plan = planThreadLinks([SELF, ANNA], [], []);

    expect(plan).toEqual({ contactIds: [], dealId: null, dealChoices: [] });
  });

  it("links nothing when the thread is only the mailbox owner", () => {
    const plan = planThreadLinks([SELF], [{ identifier: "max@vendor.example", contactId: "contact-max" }], []);

    expect(plan.contactIds).toEqual([]);
  });
});
