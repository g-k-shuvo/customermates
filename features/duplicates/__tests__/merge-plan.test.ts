import type { MergeMember } from "../merge/merge-plan";

import { describe, expect, it } from "vitest";

import { concatNotes, mergeSourcesAreMembers, planWinnerUpdate } from "../merge/merge-plan";

const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

const member = (id: string, overrides: Partial<MergeMember> = {}): MergeMember => ({
  id,
  firstName: "Ada",
  lastName: "Lovelace",
  avatarUrl: null,
  notes: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  identifiers: [],
  organizationIds: [],
  userIds: [],
  dealIds: [],
  taskIds: [],
  customFieldValues: [],
  leadIds: [],
  fileIds: [],
  documentIds: [],
  refIds: [],
  ...overrides,
});

describe("planning a merge", () => {
  it("keeps every note, the winner's first, separated by a rule", () => {
    expect(concatNotes([doc("winner"), null, doc("loser")])).toEqual({
      type: "doc",
      content: [...doc("winner").content, { type: "horizontalRule" }, ...doc("loser").content],
    });
    expect(concatNotes([null, doc("only")])).toEqual(doc("only"));
  });

  it("takes each name from the chosen record and the winner otherwise", () => {
    const winner = member("w", { firstName: "A.", lastName: "Lovelace" });
    const loser = member("l", { firstName: "Augusta Ada", lastName: "King" });

    expect(planWinnerUpdate(winner, [loser], { firstName: "l" })).toMatchObject({
      firstName: "Augusta Ada",
      lastName: "Lovelace",
    });
  });

  it("fills a custom field the winner lacks, and honours an explicit pick even when it is empty", () => {
    const winner = member("w", { customFieldValues: [{ columnId: "tier", value: "gold" }] });
    const loser = member("l", {
      customFieldValues: [
        { columnId: "tier", value: "silver" },
        { columnId: "source", value: "fair" },
      ],
    });

    expect(planWinnerUpdate(winner, [loser], {}).customFieldValues).toEqual([
      { columnId: "tier", value: "gold" },
      { columnId: "source", value: "fair" },
    ]);
    expect(
      planWinnerUpdate(winner, [loser], { customFields: { tier: "l" } }).customFieldValues.find(
        (entry) => entry.columnId === "tier",
      ),
    ).toEqual({ columnId: "tier", value: "silver" });
  });

  it("refuses picks that point outside the merged records", () => {
    const members = [member("w"), member("l")];

    expect(mergeSourcesAreMembers(members, { firstName: "l", customFields: { tier: "w" } })).toBe(true);
    expect(mergeSourcesAreMembers(members, { lastName: "someone-else" })).toBe(false);
  });
});
