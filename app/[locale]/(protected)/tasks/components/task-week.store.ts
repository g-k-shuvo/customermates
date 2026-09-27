import type { RootStore } from "@/core/stores/root.store";
import type { TaskDto } from "@/features/tasks/task.schema";
import type { ActivityWindow } from "@/features/tasks/get/get-activity-window.interactor";

import { computed, makeObservable, observable, reaction, runInAction, toJS } from "mobx";
import { Action, Resource, TaskType } from "@/generated/prisma";

import { getActivityWindowAction, updateTaskAction } from "../actions";

import { BaseStore } from "@/core/base/base.store";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { isOverdue } from "@/features/tasks/task-overdue";
import {
  activityWeekDayIndex,
  activityWeekDays,
  activityWeekRange,
  isWithinActivityWeek,
  layoutActivityWeek,
  sameDueAt,
  shiftActivityWeek,
  startOfActivityWeek,
} from "@/features/tasks/activity-week";

export type TaskWeekStatus = "loading" | "ready" | "error";

function isUnscheduled(item: TaskDto): boolean {
  return item.dueAt === null && item.completedAt === null;
}

function withoutItem(items: TaskDto[], id: string): TaskDto[] {
  return items.filter((item) => item.id !== id);
}

export class TaskWeekStore extends BaseStore {
  weekStart: Date;
  selectedDayIndex: number;
  onlyMine = false;
  status: TaskWeekStatus = "loading";
  isRefreshing = false;
  dated: TaskDto[] = [];
  undated: TaskDto[] = [];
  undatedTotal = 0;
  truncated = false;
  pendingMoves = observable.map<string, TaskDto>();

  private generation = 0;
  private reloadQueued = false;

  constructor(rootStore: RootStore, now: Date = new Date()) {
    super(rootStore);

    this.weekStart = startOfActivityWeek(now);
    this.selectedDayIndex = activityWeekDayIndex(now, this.weekStart) ?? 0;

    makeObservable(this, {
      weekStart: observable.ref,
      selectedDayIndex: observable,
      onlyMine: observable,
      status: observable,
      isRefreshing: observable,
      dated: observable.ref,
      undated: observable.ref,
      undatedTotal: observable,
      truncated: observable,
      days: computed,
      weekEnd: computed,
      items: computed,
      weekItems: computed,
      trayItems: computed,
      trayCount: computed,
      layout: computed,
      canReschedule: computed,
      canFilterMine: computed,
    });
  }

  get days(): Date[] {
    return activityWeekDays(this.weekStart);
  }

  get weekEnd(): Date {
    return this.days[this.days.length - 1];
  }

  get items(): TaskDto[] {
    const byId = new Map<string, TaskDto>();

    for (const item of [...this.dated, ...this.undated]) byId.set(item.id, item);
    for (const [id, item] of this.pendingMoves) byId.set(id, item);

    return [...byId.values()];
  }

  get weekItems(): TaskDto[] {
    return this.items
      .filter((item) => isWithinActivityWeek(item.dueAt, this.weekStart))
      .sort((left, right) => (left.dueAt?.getTime() ?? 0) - (right.dueAt?.getTime() ?? 0));
  }

  get trayItems(): TaskDto[] {
    const pending = [...this.pendingMoves.values()].filter(isUnscheduled);
    const loaded = this.undated.filter((item) => !this.pendingMoves.has(item.id) && isUnscheduled(item));

    return [...pending, ...loaded];
  }

  get trayCount(): number {
    return this.trayItems.length + Math.max(0, this.undatedTotal - this.undated.length);
  }

  get layout() {
    return layoutActivityWeek(this.weekItems, this.weekStart);
  }

  get canReschedule(): boolean {
    return this.rootStore.userStore.can(Resource.tasks, Action.update);
  }

  get canFilterMine(): boolean {
    return this.rootStore.userStore.can(Resource.tasks, Action.readAll);
  }

  isDraggable = (item: TaskDto): boolean =>
    this.canReschedule && item.type === TaskType.custom && !this.pendingMoves.has(item.id);

  findItem = (taskId: string): TaskDto | undefined => this.items.find((item) => item.id === taskId);

  connect = (): (() => void) => {
    const dispose = reaction(
      () => this.rootStore.tasksStore.items,
      () => this.requestReload(),
    );

    void this.load().catch(reportApplicationError);

    return () => {
      dispose();
      this.generation += 1;
    };
  };

  requestReload = (): void => {
    if (this.reloadQueued) return;

    this.reloadQueued = true;
    queueMicrotask(() => {
      this.reloadQueued = false;
      void this.load().catch(reportApplicationError);
    });
  };

  load = async (): Promise<void> => {
    const generation = ++this.generation;
    const { from, to } = activityWeekRange(this.weekStart);
    const { tasksStore } = this.rootStore;

    runInAction(() => {
      if (this.status === "ready") this.isRefreshing = true;
      else this.status = "loading";
    });

    try {
      const result = await getActivityWindowAction({
        from,
        to,
        onlyMine: this.onlyMine,
        searchTerm: toJS(tasksStore.searchTerm),
        filters: toJS(tasksStore.filters),
      });

      if (generation !== this.generation) return;

      runInAction(() => {
        this.isRefreshing = false;

        if (result.ok) this.apply(result.data);
        else if (this.status === "ready") toastZodErrorTree(result.error);
        else this.status = "error";
      });
    } catch (error) {
      if (generation !== this.generation) return;

      runInAction(() => {
        this.isRefreshing = false;
        if (this.status !== "ready") this.status = "error";
      });

      throw error;
    }
  };

  showWeek = (weekStart: Date, dayIndex = this.selectedDayIndex): Promise<void> => {
    runInAction(() => {
      this.weekStart = startOfActivityWeek(weekStart);
      this.selectedDayIndex = dayIndex;
      this.dated = [];
      this.truncated = false;
      this.status = "loading";
    });

    return this.load();
  };

  goToPreviousWeek = (): Promise<void> => this.showWeek(shiftActivityWeek(this.weekStart, -1));

  goToNextWeek = (): Promise<void> => this.showWeek(shiftActivityWeek(this.weekStart, 1));

  goToToday = (now: Date = new Date()): Promise<void> => {
    const weekStart = startOfActivityWeek(now);

    return this.showWeek(weekStart, activityWeekDayIndex(now, weekStart) ?? 0);
  };

  setOnlyMine = (onlyMine: boolean): Promise<void> => {
    runInAction(() => {
      this.onlyMine = onlyMine;
    });

    return this.load();
  };

  selectDay = (dayIndex: number): void => {
    runInAction(() => {
      this.selectedDayIndex = dayIndex;
    });
  };

  moveTask = async (taskId: string, dueAt: Date | null): Promise<boolean> => {
    const current = this.findItem(taskId);

    if (!current || !this.isDraggable(current) || sameDueAt(current.dueAt, dueAt)) return false;

    runInAction(() => {
      this.pendingMoves.set(taskId, {
        ...current,
        dueAt,
        isOverdue: isOverdue(dueAt, current.completedAt, new Date()),
      });
    });

    try {
      const result = await updateTaskAction({ id: taskId, dueAt });

      if (!result.ok) {
        runInAction(() => this.pendingMoves.delete(taskId));
        if (!toastZodErrorTree(result.error)) this.toastError("Common.notifications.unexpectedError");

        return false;
      }

      runInAction(() => {
        this.generation += 1;
        this.replaceItem(result.data);
        this.pendingMoves.delete(taskId);
        this.isRefreshing = false;
      });

      this.syncList(result.data);
      this.requestReload();

      return true;
    } catch (error) {
      runInAction(() => this.pendingMoves.delete(taskId));

      throw error;
    }
  };

  private apply(window: ActivityWindow): void {
    this.dated = window.dated;
    this.undated = window.undated;
    this.undatedTotal = window.undatedTotal;
    this.truncated = window.truncated;
    this.status = "ready";
  }

  private replaceItem(item: TaskDto): void {
    const wasUndated = this.undated.some((candidate) => candidate.id === item.id);
    const dated = withoutItem(this.dated, item.id);
    const undated = withoutItem(this.undated, item.id);

    this.dated = isWithinActivityWeek(item.dueAt, this.weekStart) ? [...dated, item] : dated;
    this.undated = isUnscheduled(item) ? [item, ...undated] : undated;

    const isUndated = isUnscheduled(item);

    if (wasUndated !== isUndated) this.undatedTotal = Math.max(0, this.undatedTotal + (isUndated ? 1 : -1));
  }

  private syncList(item: TaskDto): void {
    const { tasksStore } = this.rootStore;

    if (tasksStore.items.some((candidate) => candidate.id === item.id)) tasksStore.upsertItemLocal(item);
  }
}
