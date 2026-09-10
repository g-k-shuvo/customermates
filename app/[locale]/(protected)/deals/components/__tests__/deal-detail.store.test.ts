import type { RootStore } from "@/core/stores/root.store";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { DealDto } from "@/features/deals/deal.schema";

import { describe, expect, it, vi } from "vitest";
import { Action, CustomColumnType, EntityType, Resource, StageKind } from "@/generated/prisma";

const dealActions = vi.hoisted(() => ({
  getDealByIdAction: vi.fn(),
  createDealAction: vi.fn(),
  updateDealAction: vi.fn(),
  deleteDealAction: vi.fn(),
}));

vi.mock("../../actions", () => dealActions);
vi.mock("../../../services/actions", () => ({
  createServiceByNameAction: vi.fn(),
  getServicesAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { DealDetailStore } from "../deal-detail.store";

const DEAL_ID = "40000000-0000-4000-8000-000000000001";
const SERVICE_ID = "50000000-0000-4000-8000-000000000001";
const STAGE_COLUMN_ID = "60000000-0000-4000-8000-000000000001";

const STAGE_ID = "00000000-0000-4000-8000-0000000000a1";
const RENEWAL_STAGE_ID = "00000000-0000-4000-8000-0000000000a2";
const WON_STAGE_ID = "00000000-0000-4000-8000-0000000000a3";
const LOST_STAGE_ID = "00000000-0000-4000-8000-0000000000a4";
const PIPELINE_ID = "00000000-0000-4000-8000-0000000000b1";
const RENEWAL_PIPELINE_ID = "00000000-0000-4000-8000-0000000000b2";

const stageColumn: CustomColumnDto = {
  id: STAGE_COLUMN_ID,
  entityType: EntityType.deal,
  label: "Stage",
  type: CustomColumnType.singleSelect,
  options: {
    options: [
      {
        color: "default",
        index: 0,
        isDefault: false,
        label: "Proposal",
        value: "proposal",
        weight: 50,
      },
    ],
  },
};

function deal(): DealDto {
  return {
    id: DEAL_ID,
    name: "Expansion",
    totalValue: 1_000,
    totalQuantity: 10,
    weightedValue: null,
    pipelineId: null,
    stageId: STAGE_ID,
    status: "open" as const,
    expectedCloseDate: null,
    probability: null,
    stageEnteredAt: null,
    isRotting: false,
    lostReasonId: null,
    lostReasonName: null,
    lostNotes: null,
    wonAt: null,
    lostAt: null,
    closedAt: null,
    notes: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    organizations: [],
    users: [],
    contacts: [],
    services: [{ id: SERVICE_ID, name: "Visible service", amount: 100, quantity: 1 }],
    tasks: [],
    customFieldValues: [{ columnId: STAGE_COLUMN_ID, value: "proposal" }],
  };
}

const stages = [
  { id: STAGE_ID, name: "Proposal", probability: 50, pipelineId: PIPELINE_ID, kind: StageKind.open },
  { id: WON_STAGE_ID, name: "Won", probability: 100, pipelineId: PIPELINE_ID, kind: StageKind.won },
  { id: LOST_STAGE_ID, name: "Lost", probability: 0, pipelineId: PIPELINE_ID, kind: StageKind.lost },
  { id: RENEWAL_STAGE_ID, name: "Renewal", probability: 20, pipelineId: RENEWAL_PIPELINE_ID, kind: StageKind.open },
];

function rootStore(canReadAllServices: boolean): RootStore {
  const dealsStore = {
    stages,
    pipelines: [
      { id: PIPELINE_ID, name: "New business", isDefault: true, isArchived: false },
      { id: RENEWAL_PIPELINE_ID, name: "Renewals", isDefault: false, isArchived: false },
    ],
    stageById: new Map(stages.map((stage) => [stage.id, stage])),
    defaultPipelineId: PIPELINE_ID,
    stagesForPipeline: (pipelineId: string | null) =>
      pipelineId === null ? stages : stages.filter((stage) => stage.pipelineId === pipelineId),
    customColumns: [] as CustomColumnDto[],
    setCustomColumns: vi.fn((columns: CustomColumnDto[]) => {
      dealsStore.customColumns = columns;
    }),
    refreshCustomColumns: vi.fn(),
    upsertItem: vi.fn(),
    removeItem: vi.fn(),
  };

  return {
    registerModalStore: vi.fn(),
    dealsStore,
    companyStore: { company: {} },
    userStore: {
      user: { id: "user-1" },
      can: vi.fn((resource: Resource, action: Action) =>
        resource === Resource.services && action === Action.readAll ? canReadAllServices : true,
      ),
      canAccess: vi.fn(() => true),
      canManage: vi.fn(() => true),
    },
    loadingOverlayStore: { withLoading: (fn: () => unknown) => fn() },
    globalSearchModalStore: {
      pushRecentItem: vi.fn(),
      removeRecentItem: vi.fn(),
    },
    localeStore: { locale: "en", getTranslation: (key: string) => key },
  } as unknown as RootStore;
}

describe("DealDetailStore totals", () => {
  it("keeps authoritative totals when service relations are permission-filtered", () => {
    const store = new DealDetailStore(rootStore(false));

    store.hydrate(deal(), [stageColumn]);

    expect(store.totalValue).toBe(1_000);
    expect(store.totalQuantity).toBe(10);
    expect(store.weightedValueBreakdown).toMatchObject({
      value: 1_000,
      weightedValue: 500,
      percent: 50,
      stage: "Proposal",
    });
  });

  it("previews live totals when the complete service relation is available", () => {
    const store = new DealDetailStore(rootStore(true));

    store.hydrate(deal(), [stageColumn]);

    expect(store.totalValue).toBe(100);
    expect(store.totalQuantity).toBe(1);
    expect(store.weightedValueBreakdown?.weightedValue).toBe(50);
  });
});

describe("DealDetailStore pipeline placement", () => {
  it("offers every pipeline and, until one is chosen, every open stage", () => {
    const store = new DealDetailStore(rootStore(true));

    store.hydrate(deal(), [stageColumn]);

    expect(store.pipelineOptions.map((pipeline) => pipeline.id)).toEqual([PIPELINE_ID, RENEWAL_PIPELINE_ID]);
    expect(store.stageOptions.map((stage) => stage.id)).toEqual([STAGE_ID, RENEWAL_STAGE_ID]);
  });

  it("never offers a won or lost stage, which only the close actions may write", () => {
    const store = new DealDetailStore(rootStore(true));

    store.hydrate(deal(), [stageColumn]);
    store.selectPipeline(PIPELINE_ID);

    expect(store.stageOptions.map((stage) => stage.id)).toEqual([STAGE_ID]);
  });

  it("seeds a new record with the default pipeline so its stage list is scoped from the start", () => {
    const store = new DealDetailStore(rootStore(true));

    store.initialize();

    expect(store.form.pipelineId).toBe(PIPELINE_ID);
    expect(store.stageOptions.map((stage) => stage.id)).toEqual([STAGE_ID]);
  });

  it("narrows the stages to the chosen pipeline and drops a stage from the old one", () => {
    const store = new DealDetailStore(rootStore(true));

    store.hydrate(deal(), [stageColumn]);
    store.selectStage(STAGE_ID);

    expect(store.form.stageId).toBe(STAGE_ID);
    expect(store.form.pipelineId).toBe(PIPELINE_ID);

    store.selectPipeline(RENEWAL_PIPELINE_ID);

    expect(store.form.pipelineId).toBe(RENEWAL_PIPELINE_ID);
    expect(store.form.stageId).toBeUndefined();
    expect(store.stageOptions.map((stage) => stage.id)).toEqual([RENEWAL_STAGE_ID]);
  });

  it("leaves the stage alone when the same pipeline is re-picked", () => {
    const store = new DealDetailStore(rootStore(true));

    store.hydrate(deal(), [stageColumn]);
    store.selectStage(STAGE_ID);
    store.selectPipeline(PIPELINE_ID);

    expect(store.form.stageId).toBe(STAGE_ID);
  });
});
