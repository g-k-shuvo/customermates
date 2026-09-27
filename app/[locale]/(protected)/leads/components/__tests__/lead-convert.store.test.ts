import type { RootStore } from "@/core/stores/root.store";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { StageKind } from "@/generated/prisma";

const convertLeadToDealAction = vi.hoisted(() => vi.fn());

vi.mock("../../actions", () => ({ convertLeadToDealAction }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { LeadConvertStore } from "../lead-convert.store";

const LEAD = { id: "3f4a1a52-6d0e-4f6f-9c29-3f6f0f7f5a11", title: "Website redesign", value: 50_000 };
const SALES = "5c1b2d63-7e1f-4a70-8d3a-4a7b1c8d9e22";
const DELIVERY = "6d2c3e74-8f20-4b81-9e4b-5b8c2d9e0f44";
const ARCHIVED = "7e3d4f85-9031-4c92-8f5c-6c9d3e0f1a55";

const stages = [
  { id: "qualified", name: "Qualified", probability: 40, pipelineId: SALES, kind: StageKind.open },
  { id: "proposal", name: "Proposal", probability: 60, pipelineId: SALES, kind: StageKind.open },
  { id: "won", name: "Won", probability: 100, pipelineId: SALES, kind: StageKind.won },
  { id: "kickoff", name: "Kickoff", probability: 0, pipelineId: DELIVERY, kind: StageKind.open },
];

function rootStore() {
  const dealsStore = {
    pipelines: [
      { id: SALES, name: "Sales", isDefault: true, isArchived: false },
      { id: DELIVERY, name: "Delivery", isDefault: false, isArchived: false },
      { id: ARCHIVED, name: "Old", isDefault: false, isArchived: true },
    ],
    defaultPipelineId: SALES,
    stagesForPipeline: (pipelineId: string | null) => stages.filter((stage) => stage.pipelineId === pipelineId),
    ensurePipelinesLoaded: vi.fn(() => Promise.resolve()),
    isReady: false,
    refresh: vi.fn(),
  };

  return {
    dealsStore,
    leadsStore: { isReady: false, refresh: vi.fn() },
    leadDetailStore: { fetchedEntity: { id: LEAD.id }, loadById: vi.fn(() => Promise.resolve()) },
    userStore: { user: { id: "user" }, canManage: () => true, canAccess: () => true, can: () => true },
  } as unknown as RootStore;
}

describe("LeadConvertStore", () => {
  beforeEach(() => convertLeadToDealAction.mockReset());

  it("opens with the lead's title and value in the default pipeline's first open stage", async () => {
    const store = new LeadConvertStore(rootStore());

    await store.prepare(LEAD);

    expect(store.isOpen).toBe(true);
    expect(store.form).toMatchObject({
      name: "Website redesign",
      baseValue: 50_000,
      pipelineId: SALES,
      stageId: "qualified",
    });
    expect(store.pipelineOptions.map((pipeline) => pipeline.id)).toEqual([SALES, DELIVERY]);
    expect(store.stageOptions.map((stage) => stage.id)).toEqual(["qualified", "proposal"]);
    expect(store.selectedStage?.probability).toBe(40);
  });

  it("moves the stage to the first open stage of a newly chosen pipeline", async () => {
    const store = new LeadConvertStore(rootStore());
    await store.prepare(LEAD);

    store.selectPipeline(DELIVERY);

    expect(store.form).toMatchObject({ pipelineId: DELIVERY, stageId: "kickoff" });
  });

  it("holds the submit until the pipelines have loaded", async () => {
    const root = rootStore();
    let finishLoading = () => {};
    vi.mocked(root.dealsStore.ensurePipelinesLoaded).mockReturnValue(
      new Promise<void>((resolve) => {
        finishLoading = resolve;
      }),
    );
    const store = new LeadConvertStore(root);

    const preparing = store.prepare(LEAD);
    expect(store.isOpen).toBe(true);
    expect(store.isLoadingPlacement).toBe(true);
    expect(store.canSubmit).toBe(false);

    finishLoading();
    await preparing;
    expect(store.isLoadingPlacement).toBe(false);
    expect(store.canSubmit).toBe(true);
  });

  it("ignores the empty value a select reports while its options are being replaced", async () => {
    const store = new LeadConvertStore(rootStore());
    await store.prepare(LEAD);

    store.selectStage("");
    store.selectPipeline("");

    expect(store.form).toMatchObject({ pipelineId: SALES, stageId: "qualified" });

    store.selectStage("proposal");
    expect(store.form.stageId).toBe("proposal");
  });

  it("sends the edited details, turns the close date into a Date, and closes on success", async () => {
    const root = rootStore();
    const store = new LeadConvertStore(root);
    await store.prepare(LEAD);
    store.onChange("name", "  Website redesign, phase 1  ");
    store.onChange("baseValue", 42_000);
    store.onChange("stageId", "proposal");
    store.onChange("expectedCloseDate", "2026-11-30");
    store.onChange("probability", 75);
    convertLeadToDealAction.mockResolvedValue({ ok: true, data: { id: "deal-1" } });

    const dealId = await store.confirm();

    expect(dealId).toBe("deal-1");
    expect(convertLeadToDealAction).toHaveBeenCalledWith({
      id: LEAD.id,
      name: "Website redesign, phase 1",
      baseValue: 42_000,
      pipelineId: SALES,
      stageId: "proposal",
      expectedCloseDate: new Date("2026-11-30T00:00:00.000Z"),
      probability: 75,
    });
    expect(store.isOpen).toBe(false);
    expect(root.leadDetailStore.loadById).toHaveBeenCalledWith(LEAD.id);
  });

  it("keeps the dialog open with the error when the conversion is refused", async () => {
    const store = new LeadConvertStore(rootStore());
    await store.prepare(LEAD);
    const error = { errors: [], properties: { stageId: { errors: ["stageNotInPipeline"] } } };
    convertLeadToDealAction.mockResolvedValue({ ok: false, error });

    expect(await store.confirm()).toBeNull();
    expect(store.isOpen).toBe(true);
    expect(store.error).toEqual(error);
    expect(store.isSubmitting).toBe(false);
  });

  it("will not submit without a name, and resets everything when closed", async () => {
    const store = new LeadConvertStore(rootStore());
    await store.prepare(LEAD);
    store.onChange("name", "   ");

    expect(store.canSubmit).toBe(false);
    expect(await store.confirm()).toBeNull();
    expect(convertLeadToDealAction).not.toHaveBeenCalled();

    store.close();
    expect(store.isOpen).toBe(false);
    expect(store.form).toMatchObject({ name: "", baseValue: undefined, pipelineId: undefined, stageId: undefined });
  });
});
