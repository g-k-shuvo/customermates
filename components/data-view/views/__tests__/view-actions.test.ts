import type { BaseDataViewStore } from "@/core/base/base-data-view.store";
import type { DataViewChipDto } from "@/core/data-view/data-view-state.schema";

import { isObservable, observable } from "mobx";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ upsertDataViewAction: vi.fn() }));

vi.mock("@/app/actions", () => ({
  deleteDataViewAction: vi.fn(),
  upsertDataViewAction: (...args: unknown[]) => harness.upsertDataViewAction(...args),
}));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: vi.fn(() => true) }));

import { duplicateView, moveView, setViewShared, updateViewMeta } from "../view-actions";

type Item = { id: string };

const VIEW: DataViewChipDto = {
  id: "v-a",
  name: "Ada",
  position: 0,
  state: { filters: [], hiddenColumns: ["email"], sortDescriptor: { direction: "asc", field: "name" } },
};

function observableStore() {
  return observable({
    p13nId: "deals-card-store",
    refresh: () => Promise.resolve(),
    views: [VIEW],
  }) as unknown as BaseDataViewStore<Item>;
}

function sentPayload(): { name: string; position?: number; state: unknown } {
  return harness.upsertDataViewAction.mock.calls[0][0] as { name: string; position?: number; state: unknown };
}

describe("view actions send plain objects to the server", () => {
  beforeEach(() => {
    harness.upsertDataViewAction.mockReset().mockResolvedValue({ data: { ...VIEW, id: "v-new" }, ok: true });
  });

  it("strips the observable wrapper from the state when renaming or moving a view", async () => {
    const store = observableStore();
    const view = store.views[0];
    expect(isObservable(view.state)).toBe(true);

    await updateViewMeta(store, view, { name: "Renamed", position: 3 });

    const payload = sentPayload();
    expect(isObservable(payload.state)).toBe(false);
    expect(payload).toMatchObject({ id: "v-a", name: "Renamed", position: 3, state: VIEW.state });
  });

  it("sends the store's live state, not the chip snapshot, when renaming the active view", async () => {
    const store = observable({
      activeViewKey: "v-a",
      columnOrder: [],
      columnWidths: { name: 320 },
      filters: [{ field: "stage", operator: "in", value: ["won"] }],
      grouping: null,
      hiddenColumns: [],
      p13nId: "deals-card-store",
      pagination: { page: 3, pageSize: 50 },
      refresh: () => Promise.resolve(),
      searchTerm: "acme",
      sortDescriptor: undefined,
      viewMode: "table",
      views: [VIEW],
    }) as unknown as BaseDataViewStore<Item>;

    await updateViewMeta(store, store.views[0], { name: "Renamed" });

    const payload = sentPayload();
    expect(isObservable(payload.state)).toBe(false);
    expect(payload.state).toEqual({
      columnOrder: [],
      columnWidths: { name: 320 },
      filters: [{ field: "stage", operator: "in", value: ["won"] }],
      grouping: null,
      hiddenColumns: [],
      pageSize: 50,
      searchTerm: "acme",
      sortDescriptor: null,
      viewMode: "table",
    });
  });

  it("strips the observable wrapper from the state when duplicating a view", async () => {
    const store = observableStore();

    await duplicateView(store, store.views[0], { name: "Ada copy" });

    const payload = sentPayload();
    expect(isObservable(payload.state)).toBe(false);
    expect(payload).toEqual({ name: "Ada copy", state: VIEW.state, surfaceKey: "deals-card-store" });
  });
});

describe("view actions for shared views", () => {
  beforeEach(() => {
    harness.upsertDataViewAction.mockReset().mockResolvedValue({ data: { ...VIEW, shared: true }, ok: true });
  });

  it("sends only the sharing flag when the owner shares a view, then reloads the rail", async () => {
    const refresh = vi.fn(() => Promise.resolve());
    const store = observable({
      p13nId: "deals-card-store",
      refresh,
      views: [VIEW],
    }) as unknown as BaseDataViewStore<Item>;

    await expect(setViewShared(store, VIEW, true)).resolves.toBe(true);

    expect(harness.upsertDataViewAction).toHaveBeenCalledWith({
      id: "v-a",
      shared: true,
      surfaceKey: "deals-card-store",
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("moves a view only among the caller's own views, never past a colleague's", async () => {
    const theirs: DataViewChipDto = { id: "v-theirs", name: "Team", position: 1, sharedBy: "Sofia Rossi", state: {} };
    const store = observable({
      activeViewKey: "__all__",
      p13nId: "deals-card-store",
      refresh: () => Promise.resolve(),
      views: [VIEW, theirs],
    }) as unknown as BaseDataViewStore<Item>;

    await expect(moveView(store, store.views[0], 1)).resolves.toBe(false);
    expect(harness.upsertDataViewAction).not.toHaveBeenCalled();
  });

  it("copies what a colleague's shared view shows right now, so unsaved changes survive the duplicate", async () => {
    const theirs: DataViewChipDto = {
      id: "v-theirs",
      name: "Team",
      position: 0,
      sharedBy: "Sofia Rossi",
      shared: true,
      state: { searchTerm: "saved by the owner" },
    };
    const store = observable({
      activeViewKey: "v-theirs",
      columnOrder: [],
      columnWidths: {},
      filters: [],
      grouping: null,
      hiddenColumns: [],
      p13nId: "deals-card-store",
      pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 },
      refresh: () => Promise.resolve(),
      searchTerm: "changed here",
      sortDescriptor: undefined,
      viewMode: "table",
      views: [theirs],
    }) as unknown as BaseDataViewStore<Item>;

    await duplicateView(store, theirs, { name: "Mine" });

    expect(harness.upsertDataViewAction.mock.calls[0][0]).toMatchObject({
      name: "Mine",
      state: { searchTerm: "changed here" },
    });
  });
});
