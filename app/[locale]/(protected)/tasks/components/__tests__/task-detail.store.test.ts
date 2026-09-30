import type { RootStore } from "@/core/stores/root.store";

import { autorun } from "mobx";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../actions", () => ({
  createTaskAction: vi.fn(),
  deleteTaskAction: vi.fn(),
  getTaskByIdAction: vi.fn(),
  updateTaskAction: vi.fn(),
}));

import { TaskDetailStore } from "../task-detail.store";

function rootStore() {
  return {
    registerModalStore: vi.fn(),
    tasksStore: { customColumns: [], refresh: vi.fn() },
    localeStore: { getTranslation: (key: string) => key },
    userStore: { user: { id: "user" }, canManage: () => true, canAccess: () => true, can: () => true },
  } as unknown as RootStore;
}

describe("TaskDetailStore new task form", () => {
  it.each(["activityKind", "dueAt", "durationMinutes"])("tracks %s from the moment a new task opens", (id) => {
    const store = new TaskDetailStore(rootStore());
    store.initialize();
    const seen: unknown[] = [];

    const stop = autorun(() => seen.push(store.getValue(id)));
    store.onChange(id, id === "durationMinutes" ? 30 : "call");
    stop();

    expect(seen).toEqual([undefined, id === "durationMinutes" ? 30 : "call"]);
  });
});
