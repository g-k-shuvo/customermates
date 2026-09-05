import type { GetResult } from "@/core/base/base-get.interactor";
import type { RootStore } from "@/core/stores/root.store";
import type { DealDto } from "@/features/deals/deal.schema";
import type { PipelineDto } from "@/features/pipelines/pipeline.schema";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { StageKind } from "@/generated/prisma";

const { updateEntityStageAction } = vi.hoisted(() => ({ updateEntityStageAction: vi.fn() }));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("@/app/actions", () => ({
  bulkDeleteEntitiesAction: vi.fn(),
  bulkUpdateCustomFieldValuesAction: vi.fn(),
  getCustomColumnsByEntityTypeAction: vi.fn(),
  updateEntityCustomFieldValueAction: vi.fn(),
  updateEntityStageAction,
  upsertP13nAction: vi.fn(),
}));

vi.mock("../../actions", () => ({ getDealsAction: vi.fn() }));

import { STAGE_GROUPING_KEY } from "@/core/base/base-get.schema";

import { PIPELINE_FILTER_FIELD, pipelineFilter } from "../deal-board-filters";
import { DealsStore } from "../deals.store";

const NEW_PIPELINE = "10000000-0000-4000-8000-000000000001";
const OTHER_PIPELINE = "10000000-0000-4000-8000-000000000002";

const OPEN_STAGE = "20000000-0000-4000-8000-0000000000a1";
const WON_STAGE = "20000000-0000-4000-8000-0000000000a2";
const LOST_STAGE = "20000000-0000-4000-8000-0000000000a3";
const OTHER_STAGE = "20000000-0000-4000-8000-0000000000b1";

const DEAL_ID = "30000000-0000-4000-8000-000000000001";

const closeStore = {
  markWon: vi.fn<(dealId: string) => Promise<boolean>>(),
  requestLost: vi.fn<(dealId: string) => Promise<boolean>>(),
};

const pipelinesStore = { isLoading: false, pipelines: [] as PipelineDto[], load: vi.fn() };

const TIMESTAMP = new Date("2026-01-01T00:00:00.000Z");

function stage(id: string, name: string, kind: StageKind, position: number) {
  return { id, name, position, probability: 0, rottingDays: null, kind, createdAt: TIMESTAMP, updatedAt: TIMESTAMP };
}

function pipeline(id: string, name: string, stages: PipelineDto["stages"], archived = false): PipelineDto {
  return {
    id,
    name,
    position: 0,
    isDefault: id === NEW_PIPELINE,
    archivedAt: archived ? TIMESTAMP : null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    stages,
  };
}

const catalog: PipelineDto[] = [
  pipeline(NEW_PIPELINE, "New business", [
    stage(OPEN_STAGE, "Proposal", StageKind.open, 0),
    stage(WON_STAGE, "Won", StageKind.won, 1),
    stage(LOST_STAGE, "Lost", StageKind.lost, 2),
  ]),
  pipeline(OTHER_PIPELINE, "Renewals", [stage(OTHER_STAGE, "Renewal review", StageKind.open, 0)]),
];

function rootStore(): RootStore {
  return {
    localeStore: { getTranslation: (key: string) => key },
    activityTimelines: { refreshForMany: vi.fn() },
    dealCloseStore: closeStore,
    pipelinesStore,
    userStore: { canAccess: vi.fn(() => true), canManage: vi.fn(() => true), can: vi.fn(() => true) },
  } as unknown as RootStore;
}

function boardResult(): GetResult<DealDto> {
  return {
    items: [{ id: DEAL_ID, stageId: OPEN_STAGE } as DealDto],
    groupCounts: { [OPEN_STAGE]: 1, [WON_STAGE]: 0, [LOST_STAGE]: 0 },
    groupValueSums: {},
    groupOptions: [],
  } as unknown as GetResult<DealDto>;
}

function createStore() {
  const store = new DealsStore(rootStore());
  store.setItems(boardResult());
  store.setCustomColumns([]);
  store.setPipelineCatalog(catalog);
  return store;
}

async function dragTo(store: DealsStore, stageId: string) {
  const item = { id: DEAL_ID, stageId: OPEN_STAGE } as DealDto;

  await store.moveItemBetweenGroups({
    item,
    optimisticItem: { ...item, stageId } as DealDto,
    columnId: STAGE_GROUPING_KEY,
    fromGroupKey: OPEN_STAGE,
    toGroupKey: stageId,
    value: stageId,
  });
}

function movedStageId(store: DealsStore) {
  return store.items.find((deal) => deal.id === DEAL_ID)?.stageId;
}

beforeEach(() => {
  updateEntityStageAction.mockReset();
  closeStore.markWon.mockReset();
  closeStore.requestLost.mockReset();
  pipelinesStore.load.mockReset();
  pipelinesStore.pipelines = [];
  pipelinesStore.isLoading = false;
});

describe("the pipeline catalog the board is given", () => {
  it("flattens every pipeline's stages and remembers which pipeline each one belongs to", () => {
    const store = createStore();

    expect(store.pipelines).toEqual([
      { id: NEW_PIPELINE, name: "New business", isDefault: true, isArchived: false },
      { id: OTHER_PIPELINE, name: "Renewals", isDefault: false, isArchived: false },
    ]);
    expect(store.stagesForPipeline(OTHER_PIPELINE).map((entry) => entry.id)).toEqual([OTHER_STAGE]);
    expect(store.stagesForPipeline(null)).toHaveLength(4);
    expect(store.stageById.get(WON_STAGE)?.kind).toBe(StageKind.won);
  });

  it("reads an archived pipeline out of the catalog rather than hiding it", () => {
    const store = createStore();

    store.setPipelineCatalog([pipeline(OTHER_PIPELINE, "Renewals", [], true)]);

    expect(store.pipelines).toEqual([{ id: OTHER_PIPELINE, name: "Renewals", isDefault: false, isArchived: true }]);
  });
});

describe("selecting a pipeline", () => {
  it("goes through the ordinary filter path, so the URL and personalization follow", () => {
    const store = createStore();

    store.selectPipeline(OTHER_PIPELINE);

    expect(store.filters).toEqual([pipelineFilter(OTHER_PIPELINE)]);
    expect(store.selectedPipelineId).toBe(OTHER_PIPELINE);
    expect(store.selectedPipeline?.name).toBe("Renewals");
  });

  it("clears only the pipeline clause when every pipeline is asked for", () => {
    const store = createStore();

    store.selectPipeline(OTHER_PIPELINE);
    store.selectPipeline(null);

    expect(store.filters?.some((filter) => filter.field === PIPELINE_FILTER_FIELD)).toBe(false);
    expect(store.selectedPipeline).toBeNull();
  });
});

describe("dropping a card on a terminal column", () => {
  it("closes the record as won instead of writing the stage on its own", async () => {
    const store = createStore();
    closeStore.markWon.mockResolvedValue(true);

    await dragTo(store, WON_STAGE);

    expect(closeStore.markWon).toHaveBeenCalledWith(DEAL_ID);
    expect(updateEntityStageAction).not.toHaveBeenCalled();
  });

  it("asks for a lost reason and closes the record once it is confirmed", async () => {
    const store = createStore();
    closeStore.requestLost.mockResolvedValue(true);

    await dragTo(store, LOST_STAGE);

    expect(closeStore.requestLost).toHaveBeenCalledWith(DEAL_ID);
    expect(updateEntityStageAction).not.toHaveBeenCalled();
  });

  it("puts the card back when the lost reason prompt is dismissed", async () => {
    const store = createStore();
    closeStore.requestLost.mockResolvedValue(false);

    await dragTo(store, LOST_STAGE);

    expect(movedStageId(store)).toBe(OPEN_STAGE);
    expect(store.groupCounts[OPEN_STAGE]).toBe(1);
    expect(store.groupCounts[LOST_STAGE]).toBe(0);
  });

  it("puts the card back when the won transition is refused", async () => {
    const store = createStore();
    closeStore.markWon.mockResolvedValue(false);

    await dragTo(store, WON_STAGE);

    expect(movedStageId(store)).toBe(OPEN_STAGE);
  });

  it("still writes the plain stage update for an ordinary column", async () => {
    const store = createStore();
    updateEntityStageAction.mockResolvedValue({ ok: true, data: { id: DEAL_ID, stageId: OTHER_STAGE } });

    await dragTo(store, OTHER_STAGE);

    expect(updateEntityStageAction).toHaveBeenCalledWith({ entityId: DEAL_ID, stageId: OTHER_STAGE });
    expect(closeStore.markWon).not.toHaveBeenCalled();
    expect(closeStore.requestLost).not.toHaveBeenCalled();
    expect(movedStageId(store)).toBe(OTHER_STAGE);
  });
});

describe("hydrating the catalog away from the board", () => {
  it("loads the pipelines once when the page never supplied them", async () => {
    const store = new DealsStore(rootStore());
    pipelinesStore.load.mockImplementation(() => {
      pipelinesStore.pipelines = catalog;
      return Promise.resolve();
    });

    await store.ensurePipelinesLoaded();

    expect(pipelinesStore.load).toHaveBeenCalledTimes(1);
    expect(store.pipelines).toHaveLength(2);

    await store.ensurePipelinesLoaded();

    expect(pipelinesStore.load).toHaveBeenCalledTimes(1);
  });

  it("leaves the catalog alone when the page already supplied it", async () => {
    const store = createStore();

    await store.ensurePipelinesLoaded();

    expect(pipelinesStore.load).not.toHaveBeenCalled();
  });
});
