import type { DataViewChipDto } from "@/core/data-view/data-view-state.schema";

import { describe, expect, it } from "vitest";

import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";

import { allViewMenuItems, colleagueViewMenuItems, orderChips, viewMenuItems } from "../view-rail-model";

function chip(overrides: Partial<DataViewChipDto> & { id: string }): DataViewChipDto {
  return {
    name: `view ${overrides.id}`,
    position: 0,
    state: {},
    ...overrides,
  };
}

function views(count: number): DataViewChipDto[] {
  return Array.from({ length: count }, (_, index) => chip({ id: `v${index}`, position: index }));
}

function ids(chips: ReturnType<typeof orderChips>): string[] {
  return chips.map((entry) => (entry.kind === "view" ? entry.view.id : entry.kind));
}

describe("view rail model", () => {
  it("puts All first and orders views by position", () => {
    const unordered = [chip({ id: "c", position: 2 }), chip({ id: "a", position: 0 }), chip({ id: "b", position: 1 })];

    const chips = orderChips(unordered, ALL_VIEW_KEY);

    expect(ids(chips)).toEqual(["all", "a", "b", "c"]);
    expect(chips[0]).toEqual({ isActive: true, kind: "all" });
  });

  it("breaks a position tie by name then id so the order never flickers", () => {
    const tied = [
      chip({ id: "z", name: "alpha", position: 5 }),
      chip({ id: "a", name: "alpha", position: 5 }),
      chip({ id: "m", name: "beta", position: 5 }),
    ];

    expect(ids(orderChips(tied, ALL_VIEW_KEY))).toEqual(["all", "a", "z", "m"]);
    expect(ids(orderChips([...tied].reverse(), ALL_VIEW_KEY))).toEqual(["all", "a", "z", "m"]);
  });

  it("moves a chip exactly one slot when positions are swapped with a neighbour", () => {
    const before = [chip({ id: "alpha", name: "Alpha", position: 0 }), chip({ id: "beta", name: "Beta", position: 1 })];
    const after = before.map((view) => ({ ...view, position: view.id === "beta" ? 0 : 1 }));

    expect(ids(orderChips(before, ALL_VIEW_KEY))).toEqual(["all", "alpha", "beta"]);
    expect(ids(orderChips(after, ALL_VIEW_KEY))).toEqual(["all", "beta", "alpha"]);
  });

  it("never caps the rail, however many views there are", () => {
    const chips = orderChips(views(40), "v33");

    expect(chips).toHaveLength(41);
    expect(chips.filter((entry) => entry.isActive)).toHaveLength(1);
    expect(chips.find((entry) => entry.kind === "view" && entry.view.id === "v33")).toMatchObject({ isActive: true });
  });

  it("marks exactly one tab active and falls back to All for a key that matches no view", () => {
    expect(orderChips(views(3), "v1").map((entry) => entry.isActive)).toEqual([false, false, true, false]);
    expect(orderChips(views(3), "gone").map((entry) => entry.isActive)).toEqual([true, false, false, false]);
    expect(orderChips([], "gone")).toEqual([{ isActive: true, kind: "all" }]);
  });

  it("offers the same seven actions on every view of your own, in a fixed order", () => {
    const items = viewMenuItems({ index: 1, total: 3 });

    expect(items.map((item) => item.id)).toEqual([
      "edit",
      "duplicate",
      "moveLeft",
      "moveRight",
      "share",
      "copyLink",
      "delete",
    ]);
    expect(items.filter((item) => item.isDestructive).map((item) => item.id)).toEqual(["delete"]);
    expect(items.every((item) => !item.isDisabled)).toBe(true);
  });

  it("offers only duplicate and copy link on the All tab, since it has no row and no position", () => {
    const items = allViewMenuItems();

    expect(items.map((item) => item.id)).toEqual(["duplicate", "copyLink"]);
    expect(items.some((item) => item.isDestructive)).toBe(false);
    expect(items.some((item) => item.isDisabled)).toBe(false);
    for (const id of ["edit", "delete", "moveLeft", "moveRight"]) {
      expect(
        items.map((item) => item.id),
        id,
      ).not.toContain(id);
    }
  });

  it("disables each move at its end of the list", () => {
    const first = viewMenuItems({ index: 0, total: 3 });
    const last = viewMenuItems({ index: 2, total: 3 });
    const only = viewMenuItems({ index: 0, total: 1 });

    expect(first.find((item) => item.id === "moveLeft")?.isDisabled).toBe(true);
    expect(first.find((item) => item.id === "moveRight")?.isDisabled).toBe(false);
    expect(last.find((item) => item.id === "moveLeft")?.isDisabled).toBe(false);
    expect(last.find((item) => item.id === "moveRight")?.isDisabled).toBe(true);
    expect(only.filter((item) => item.isDisabled).map((item) => item.id)).toEqual(["moveLeft", "moveRight"]);
  });

  it("offers to stop sharing a view that is already shared", () => {
    const ids = viewMenuItems({ index: 0, total: 1, shared: true }).map((item) => item.id);

    expect(ids).toContain("unshare");
    expect(ids).not.toContain("share");
  });

  it("offers only duplicate and copy link on a view a colleague shared, since it is theirs to change", () => {
    expect(colleagueViewMenuItems().map((item) => item.id)).toEqual(["duplicate", "copyLink"]);
  });

  it("lists a colleague's shared views after your own, whatever their positions", () => {
    const mixed = [
      chip({ id: "theirs", position: 0, sharedBy: "Sofia Rossi", shared: true }),
      chip({ id: "mine-b", position: 5 }),
      chip({ id: "mine-a", position: 1, shared: true }),
    ];

    expect(ids(orderChips(mixed, ALL_VIEW_KEY))).toEqual(["all", "mine-a", "mine-b", "theirs"]);
    expect(orderChips(mixed, "theirs").find((entry) => entry.isActive)).toMatchObject({ kind: "view" });
  });
});
