import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DataViewGroup, GroupingResult } from "@/core/base/grouping/grouping.schema";
import type { GetResult } from "../base-get.interactor";
import type { RootStore } from "@/core/stores/root.store";

import { EntityType } from "@/generated/prisma";

import { BaseDataViewStore } from "../base-data-view.store";
import { STAGE_GROUPING_KEY } from "../base-get.schema";

const { updateEntityStageAction, updateEntityCustomFieldValueAction } = vi.hoisted(() => ({
  updateEntityStageAction: vi.fn(),
  updateEntityCustomFieldValueAction: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/app/actions", () => ({
  bulkDeleteEntitiesAction: vi.fn(),
  bulkUpdateCustomFieldValuesAction: vi.fn(),
  getCustomColumnsByEntityTypeAction: vi.fn(),
  updateEntityStageAction,
  updateEntityCustomFieldValueAction,
  upsertP13nAction: vi.fn(),
}));

type Item = { id: string; stageId?: string | null; totalValue?: number; weightedValue?: number | null };

const OPEN_STAGE = "00000000-0000-4000-8000-0000000000a1";
const WON_STAGE = "00000000-0000-4000-8000-0000000000a2";

class TestStore extends BaseDataViewStore<Item> {
  constructor(rootStore: RootStore) {
    super(rootStore, undefined, EntityType.deal);
  }

  get columnsDefinition() {
    return [];
  }
}

function rootStore() {
  return {
    localeStore: { getTranslation: (key: string) => key },
    activityTimelines: { refreshForMany: vi.fn() },
  } as unknown as RootStore;
}

function group(key: string, label: string, itemIds: string[], weight: number): DataViewGroup {
  return {
    key,
    count: itemIds.length,
    labelKind: "value",
    label,
    weight,
    isNoValue: false,
    materialised: true,
    itemIds,
    hasMore: false,
  };
}

function grouping(): GroupingResult {
  return {
    grouping: { field: STAGE_GROUPING_KEY },
    kind: "stage",
    supportsDragWriteBack: true,
    groups: [group(OPEN_STAGE, "Open", ["deal-1"], 10), group(WON_STAGE, "Won", [], 100)],
    total: 1,
  };
}

function stageResult(): GetResult<Item> {
  return {
    items: [{ id: "deal-1", stageId: OPEN_STAGE, totalValue: 300, weightedValue: 30 }],
    grouping: grouping(),
    groupCounts: { [OPEN_STAGE]: 1, [WON_STAGE]: 0 },
    groupValueSums: { [OPEN_STAGE]: { totalValue: 300, weightedValue: 30 } },
  };
}

function createStore() {
  const store = new TestStore(rootStore());
  store.setItems(stageResult());
  store.setCustomColumns([]);
  return store;
}

describe("BaseDataViewStore stage grouping", () => {
  beforeEach(() => {
    updateEntityStageAction.mockReset();
    updateEntityCustomFieldValueAction.mockReset();
  });

  it("exposes the stage groups the server reported, in order, keeping the empty one", () => {
    const store = createStore();

    expect(store.groupingResult?.groups.map((entry) => entry.key)).toEqual([OPEN_STAGE, WON_STAGE]);
    expect(store.groupingResult?.groups.map((entry) => entry.label)).toEqual(["Open", "Won"]);
  });

  it("persists a stage move through the stage action and not the custom field action", async () => {
    const store = createStore();
    const item = { id: "deal-1", stageId: OPEN_STAGE, totalValue: 300, weightedValue: 30 };
    updateEntityStageAction.mockResolvedValue({ ok: true, data: { ...item, stageId: WON_STAGE } });

    await store.moveItemBetweenGroups({
      item,
      optimisticItem: { ...item, stageId: WON_STAGE },
      fromGroupKey: OPEN_STAGE,
      toGroupKey: WON_STAGE,
      value: WON_STAGE,
    });

    expect(updateEntityStageAction).toHaveBeenCalledTimes(1);
    expect(updateEntityCustomFieldValueAction).not.toHaveBeenCalled();
  });

  it("does not require a singleSelect custom column to move by stage", async () => {
    const store = createStore();
    const item = { id: "deal-1", stageId: OPEN_STAGE };
    updateEntityStageAction.mockResolvedValue({ ok: true, data: { ...item, stageId: WON_STAGE } });

    await store.moveItemBetweenGroups({
      item,
      optimisticItem: { ...item, stageId: WON_STAGE },
      fromGroupKey: OPEN_STAGE,
      toGroupKey: WON_STAGE,
      value: WON_STAGE,
    });

    expect(updateEntityStageAction).toHaveBeenCalledTimes(1);
    expect(store.items.find((entry) => entry.id === "deal-1")?.stageId).toBe(WON_STAGE);
  });

  it("reverts the optimistic move when the stage write fails", async () => {
    const store = createStore();
    const item = { id: "deal-1", stageId: OPEN_STAGE, totalValue: 300, weightedValue: 30 };
    updateEntityStageAction.mockResolvedValue({ ok: false, error: "nope" });

    await store.moveItemBetweenGroups({
      item,
      optimisticItem: { ...item, stageId: WON_STAGE },
      fromGroupKey: OPEN_STAGE,
      toGroupKey: WON_STAGE,
      value: WON_STAGE,
    });

    expect(store.items.find((entry) => entry.id === "deal-1")?.stageId).toBe(OPEN_STAGE);
  });
});
