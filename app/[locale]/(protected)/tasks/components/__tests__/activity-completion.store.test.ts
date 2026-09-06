import type { RootStore } from "@/core/stores/root.store";

import { beforeEach, describe, expect, it, vi } from "vitest";

const taskActions = vi.hoisted(() => ({
  completeTaskAction: vi.fn(),
  uncompleteTaskAction: vi.fn(),
}));

vi.mock("../../actions", () => taskActions);
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { ActivityCompletionStore, defaultFollowUpDueAt } from "../activity-completion.store";

const ACTIVITY_ID = "50000000-0000-4000-8000-000000000001";

const tasksStore = { isReady: false, refresh: vi.fn() };
const dealsStore = { isReady: false, refresh: vi.fn() };

function rootStore(): RootStore {
  return {
    localeStore: { getTranslation: (key: string) => key },
    tasksStore,
    dealsStore,
    taskDetailStore: { fetchedEntity: null, loadById: vi.fn() },
    dealDetailStore: { fetchedEntity: null, loadById: vi.fn() },
    userStore: { canAccess: vi.fn(() => true), canManage: vi.fn(() => true), can: vi.fn(() => true) },
  } as unknown as RootStore;
}

function target(overrides: Partial<Parameters<ActivityCompletionStore["toggle"]>[0]> = {}) {
  return {
    id: ACTIVITY_ID,
    name: "Call Bob",
    activityKind: null,
    dueAt: null,
    completedAt: null,
    hasLinkedRecords: false,
    ...overrides,
  };
}

beforeEach(() => {
  taskActions.completeTaskAction.mockReset();
  taskActions.uncompleteTaskAction.mockReset();
  tasksStore.refresh.mockReset();
  dealsStore.refresh.mockReset();
});

describe("completing an unlinked activity", () => {
  it("sends a bodyless completion without raising the follow-up prompt", async () => {
    taskActions.completeTaskAction.mockResolvedValue({ ok: true, data: {} });
    const store = new ActivityCompletionStore(rootStore());

    await store.toggle(target());

    expect(taskActions.completeTaskAction).toHaveBeenCalledWith({ id: ACTIVITY_ID, followUp: null });
    expect(store.isPromptOpen).toBe(false);
  });
});

describe("completing a linked activity", () => {
  it("asks what happens next before writing anything", async () => {
    const store = new ActivityCompletionStore(rootStore());

    await store.toggle(target({ hasLinkedRecords: true }));

    expect(taskActions.completeTaskAction).not.toHaveBeenCalled();
    expect(store.isPromptOpen).toBe(true);
  });

  it("sends the completion and the follow-up as one request", async () => {
    taskActions.completeTaskAction.mockResolvedValue({ ok: true, data: {} });
    const store = new ActivityCompletionStore(rootStore());

    await store.toggle(target({ hasLinkedRecords: true }));
    store.onChange("name", "Send the quote");

    const dueAt = store.form.dueAt;
    await store.confirmFollowUp();

    expect(taskActions.completeTaskAction).toHaveBeenCalledWith({
      id: ACTIVITY_ID,
      followUp: {
        name: "Send the quote",
        activityKind: undefined,
        dueAt: new Date(dueAt),
        durationMinutes: undefined,
      },
    });
    expect(store.isPromptOpen).toBe(false);
  });

  it("still completes when the prompt is dismissed with skip", async () => {
    taskActions.completeTaskAction.mockResolvedValue({ ok: true, data: {} });
    const store = new ActivityCompletionStore(rootStore());

    await store.toggle(target({ hasLinkedRecords: true }));
    await store.skipFollowUp();

    expect(taskActions.completeTaskAction).toHaveBeenCalledWith({ id: ACTIVITY_ID, followUp: null });
    expect(store.isPromptOpen).toBe(false);
  });

  it("keeps the prompt open when the server refuses the write", async () => {
    taskActions.completeTaskAction.mockResolvedValue({ ok: false, error: { errors: [] } });
    const store = new ActivityCompletionStore(rootStore());

    await store.toggle(target({ hasLinkedRecords: true }));
    await store.skipFollowUp();

    expect(store.isPromptOpen).toBe(true);
  });
});

describe("reversing a completion", () => {
  it("un-completes instead of prompting", async () => {
    taskActions.uncompleteTaskAction.mockResolvedValue({ ok: true, data: {} });
    const store = new ActivityCompletionStore(rootStore());

    await store.toggle(target({ completedAt: new Date("2026-09-05T09:00:00.000Z") }));

    expect(taskActions.uncompleteTaskAction).toHaveBeenCalledWith({ id: ACTIVITY_ID });
    expect(taskActions.completeTaskAction).not.toHaveBeenCalled();
  });
});

describe("the suggested follow-up date", () => {
  it("lands a week out at the start of the working day", () => {
    expect(defaultFollowUpDueAt(new Date(2026, 8, 6, 16, 42, 0))).toEqual(new Date(2026, 8, 13, 9, 0, 0, 0));
  });
});
