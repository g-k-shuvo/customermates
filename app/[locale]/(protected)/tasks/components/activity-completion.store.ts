import type { RootStore } from "@/core/stores/root.store";
import type { ActivityKind } from "@/generated/prisma";
import type { ScheduleFollowUpData } from "@/features/tasks/complete/follow-up-activity";

import { action, computed, makeObservable, observable } from "mobx";
import { Resource } from "@/generated/prisma";

import { completeTaskAction, uncompleteTaskAction } from "../actions";

import { BaseFormStore } from "@/core/base/base-form.store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

export type ActivityCompletionTarget = {
  id: string;
  name: string;
  activityKind: ActivityKind | null;
  dueAt: Date | null;
  completedAt: Date | null;
  hasLinkedRecords: boolean;
};

export type FollowUpFormData = {
  name: string;
  activityKind: string;
  dueAt: string;
  durationMinutes: number | undefined;
};

const EMPTY_FOLLOW_UP_FORM: FollowUpFormData = {
  name: "",
  activityKind: "",
  dueAt: "",
  durationMinutes: undefined,
};

const FOLLOW_UP_DEFAULT_OFFSET_DAYS = 7;

export function defaultFollowUpDueAt(from: Date): Date {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate() + FOLLOW_UP_DEFAULT_OFFSET_DAYS);

  start.setHours(9, 0, 0, 0);

  return start;
}

export class ActivityCompletionStore extends BaseFormStore<FollowUpFormData> {
  target: ActivityCompletionTarget | null = null;
  pendingIds = observable.set<string>();

  constructor(rootStore: RootStore) {
    super(rootStore, EMPTY_FOLLOW_UP_FORM, Resource.tasks);

    this.setWithUnsavedChangesGuard(false);

    makeObservable(this, {
      target: observable,
      isPromptOpen: computed,
      canSubmitFollowUp: computed,
      startPrompt: action,
      closePrompt: action,
    });
  }

  get isPromptOpen(): boolean {
    return this.target !== null;
  }

  get canSubmitFollowUp(): boolean {
    return this.form.name.trim() !== "" && this.form.dueAt !== "" && !this.isLoading;
  }

  isPending = (activityId: string): boolean => this.pendingIds.has(activityId);

  startPrompt = (target: ActivityCompletionTarget) => {
    this.target = target;
    this.onInitOrRefresh({
      ...EMPTY_FOLLOW_UP_FORM,
      activityKind: target.activityKind ?? "",
      dueAt: defaultFollowUpDueAt(new Date()).toISOString(),
    });
  };

  closePrompt = () => {
    this.target = null;
    this.onInitOrRefresh(EMPTY_FOLLOW_UP_FORM);
  };

  toggle = async (target: ActivityCompletionTarget): Promise<boolean> => {
    if (target.completedAt) return await this.uncomplete(target.id);
    if (target.hasLinkedRecords) {
      this.startPrompt(target);

      return false;
    }

    return await this.complete(target.id, null);
  };

  skipFollowUp = async (): Promise<boolean> => {
    const target = this.target;
    if (!target) return false;

    const completed = await this.complete(target.id, null);

    if (completed) this.closePrompt();

    return completed;
  };

  confirmFollowUp = async (): Promise<boolean> => {
    const target = this.target;
    if (!target || !this.canSubmitFollowUp) return false;

    const durationMinutes = this.form.durationMinutes;
    const followUp: ScheduleFollowUpData = {
      name: this.form.name.trim(),
      activityKind: (this.form.activityKind || undefined) as ActivityKind | undefined,
      dueAt: new Date(this.form.dueAt),
      durationMinutes: durationMinutes !== undefined && durationMinutes > 0 ? durationMinutes : undefined,
    };

    const completed = await this.complete(target.id, followUp);

    if (completed) this.closePrompt();

    return completed;
  };

  complete = async (activityId: string, followUp: ScheduleFollowUpData | null): Promise<boolean> => {
    return await this.run(activityId, () => completeTaskAction({ id: activityId, followUp }));
  };

  uncomplete = async (activityId: string): Promise<boolean> => {
    return await this.run(activityId, () => uncompleteTaskAction({ id: activityId }));
  };

  private run = async (
    activityId: string,
    request: () => Promise<{ ok: true } | { ok: false; error: unknown }>,
  ): Promise<boolean> => {
    if (this.pendingIds.has(activityId)) return false;

    this.pendingIds.add(activityId);
    this.setIsLoading(true);

    try {
      const result = await request();

      if (!result.ok) {
        toastZodErrorTree(result.error);

        return false;
      }

      await this.refreshAffectedViews(activityId);

      return true;
    } finally {
      this.pendingIds.delete(activityId);
      this.setIsLoading(false);
    }
  };

  private refreshAffectedViews = async (activityId: string): Promise<void> => {
    const { dealDetailStore, dealsStore, taskDetailStore, tasksStore } = this.rootStore;

    if (tasksStore.isReady) await tasksStore.refresh();
    if (dealsStore.isReady) await dealsStore.refresh();
    if (taskDetailStore.fetchedEntity?.id === activityId) await taskDetailStore.loadById(activityId);

    const openDealId = dealDetailStore.fetchedEntity?.id;

    if (openDealId) await dealDetailStore.loadById(openDealId);
  };
}
