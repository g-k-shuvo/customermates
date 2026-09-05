import type { RootStore } from "@/core/stores/root.store";

import { beforeEach, describe, expect, it, vi } from "vitest";

const dealActions = vi.hoisted(() => ({
  markDealLostAction: vi.fn(),
  markDealWonAction: vi.fn(),
  reopenDealAction: vi.fn(),
}));

vi.mock("../../actions", () => dealActions);
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { DealCloseStore } from "../deal-close.store";

const DEAL_ID = "30000000-0000-4000-8000-000000000001";
const OTHER_DEAL_ID = "30000000-0000-4000-8000-000000000002";
const LOST_REASON_ID = "40000000-0000-4000-8000-000000000001";

const dealsStore = { isReady: false, refresh: vi.fn() };

function rootStore(): RootStore {
  return {
    localeStore: { getTranslation: (key: string) => key },
    dealsStore,
    dealDetailStore: { fetchedEntity: null, loadById: vi.fn() },
    lostReasonsStore: { isLoading: false, lostReasons: [], activeLostReasons: [], load: vi.fn() },
    userStore: { canAccess: vi.fn(() => false), canManage: vi.fn(() => true), can: vi.fn(() => true) },
  } as unknown as RootStore;
}

function settled<T>(promise: Promise<T>) {
  let outcome: T | undefined;
  void promise.then((value) => {
    outcome = value;
  });

  return () => outcome;
}

beforeEach(() => {
  dealActions.markDealLostAction.mockReset();
  dealActions.markDealWonAction.mockReset();
  dealActions.reopenDealAction.mockReset();
  dealsStore.refresh.mockReset();
});

describe("the lost-reason prompt raised by a drag", () => {
  it("stays pending while the prompt is open", async () => {
    const store = new DealCloseStore(rootStore());
    const outcome = settled(store.requestLost(DEAL_ID));

    await Promise.resolve();

    expect(store.isLostPromptOpen).toBe(true);
    expect(outcome()).toBeUndefined();
  });

  it("reports a confirmed close so the card may stay where it was dropped", async () => {
    const store = new DealCloseStore(rootStore());
    dealActions.markDealLostAction.mockResolvedValue({ ok: true, data: { id: DEAL_ID } });

    const request = store.requestLost(DEAL_ID);
    await Promise.resolve();
    store.onChange("lostReasonId", LOST_REASON_ID);

    await store.confirmLost();

    expect(await request).toBe(true);
    expect(store.isLostPromptOpen).toBe(false);
    expect(dealActions.markDealLostAction).toHaveBeenCalledWith({
      id: DEAL_ID,
      lostReasonId: LOST_REASON_ID,
      lostNotes: null,
    });
  });

  it("reports a dismissal so the optimistic move is reverted", async () => {
    const store = new DealCloseStore(rootStore());

    const request = store.requestLost(DEAL_ID);
    await Promise.resolve();
    store.closeLostPrompt();

    expect(await request).toBe(false);
  });

  it("survives an unrelated deal being won while it is still open", async () => {
    const store = new DealCloseStore(rootStore());
    dealActions.markDealWonAction.mockResolvedValue({ ok: true, data: { id: OTHER_DEAL_ID } });

    const request = store.requestLost(DEAL_ID);
    const outcome = settled(request);
    await Promise.resolve();

    expect(await store.markWon(OTHER_DEAL_ID)).toBe(true);
    expect(store.isLostPromptOpen).toBe(true);
    expect(outcome()).toBeUndefined();

    store.closeLostPrompt();

    expect(await request).toBe(false);
  });

  it("survives an unrelated deal being reopened while it is still open", async () => {
    const store = new DealCloseStore(rootStore());
    dealActions.reopenDealAction.mockResolvedValue({ ok: true, data: { id: OTHER_DEAL_ID } });

    const request = store.requestLost(DEAL_ID);
    const outcome = settled(request);
    await Promise.resolve();

    expect(await store.reopen(OTHER_DEAL_ID)).toBe(true);
    expect(store.isLostPromptOpen).toBe(true);
    expect(outcome()).toBeUndefined();

    store.closeLostPrompt();

    expect(await request).toBe(false);
  });

  it("keeps the prompt open and the drag unresolved when the close fails", async () => {
    const store = new DealCloseStore(rootStore());
    dealActions.markDealLostAction.mockResolvedValue({ ok: false, error: { errors: ["nope"] } });

    const request = store.requestLost(DEAL_ID);
    const outcome = settled(request);
    await Promise.resolve();
    store.onChange("lostReasonId", LOST_REASON_ID);

    expect(await store.confirmLost()).toBe(false);
    expect(store.isLostPromptOpen).toBe(true);
    expect(outcome()).toBeUndefined();

    store.closeLostPrompt();

    expect(await request).toBe(false);
  });
});
