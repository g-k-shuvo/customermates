import type { RootStore } from "@/core/stores/root.store";
import type { LostReasonDto } from "@/features/lost-reasons/lost-reason.schema";

import { action, computed, makeObservable, observable } from "mobx";
import { Resource } from "@/generated/prisma";

import {
  createLostReasonAction,
  deleteLostReasonAction,
  getLostReasonsAction,
  updateLostReasonAction,
} from "../../actions";

import { BaseStore } from "@/core/base/base.store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { reportApplicationError } from "@/core/errors/report-application-error";

export type NewLostReasonInput = {
  name: string;
};

type MutationOutcome = { ok: true } | { ok: false; error: unknown };

function byPosition(first: { position: number }, second: { position: number }): number {
  return first.position - second.position;
}

export class LostReasonsStore extends BaseStore {
  get canManage(): boolean {
    return this.rootStore.userStore.canManage(Resource.company);
  }

  lostReasons: LostReasonDto[] = [];
  isLoading = false;
  isSaving = false;
  hasLoadError = false;

  constructor(rootStore: RootStore) {
    super(rootStore);

    makeObservable(this, {
      canManage: computed,
      lostReasons: observable,
      isLoading: observable,
      isSaving: observable,
      hasLoadError: observable,
      sortedLostReasons: computed,
      activeLostReasons: computed,
      applyLostReasons: action,
      setLoading: action,
      setSaving: action,
      setLoadError: action,
    });
  }

  get sortedLostReasons(): LostReasonDto[] {
    return [...this.lostReasons].sort(byPosition);
  }

  get activeLostReasons(): LostReasonDto[] {
    return this.sortedLostReasons.filter((lostReason) => lostReason.archivedAt === null);
  }

  setLoading = (isLoading: boolean) => {
    this.isLoading = isLoading;
  };

  setSaving = (isSaving: boolean) => {
    this.isSaving = isSaving;
  };

  setLoadError = (hasLoadError: boolean) => {
    this.hasLoadError = hasLoadError;
  };

  applyLostReasons = (lostReasons: LostReasonDto[]) => {
    this.lostReasons = lostReasons;
  };

  load = async (): Promise<void> => {
    this.setLoading(true);
    this.setLoadError(false);

    try {
      this.applyLostReasons(await getLostReasonsAction());
    } catch (error) {
      reportApplicationError(error);
      this.setLoadError(true);
    } finally {
      this.setLoading(false);
    }
  };

  createLostReason = async (input: NewLostReasonInput): Promise<boolean> => {
    return this.commit(createLostReasonAction({ name: input.name, position: this.lostReasons.length }));
  };

  renameLostReason = async (lostReasonId: string, name: string): Promise<boolean> => {
    return this.commit(updateLostReasonAction({ id: lostReasonId, name }));
  };

  archiveLostReason = async (lostReasonId: string): Promise<boolean> => {
    return this.commit(updateLostReasonAction({ id: lostReasonId, archivedAt: new Date() }));
  };

  unarchiveLostReason = async (lostReasonId: string): Promise<boolean> => {
    return this.commit(updateLostReasonAction({ id: lostReasonId, archivedAt: null }));
  };

  reorderLostReasons = async (orderedLostReasonIds: string[]): Promise<boolean> => {
    this.setSaving(true);

    try {
      for (const [position, lostReasonId] of orderedLostReasonIds.entries()) {
        const result = await updateLostReasonAction({ id: lostReasonId, position });

        if (!result.ok) {
          toastZodErrorTree(result.error);
          return false;
        }
      }

      await this.reload();
      return true;
    } finally {
      this.setSaving(false);
    }
  };

  deleteLostReason = async (lostReasonId: string): Promise<boolean> => {
    return this.commit(deleteLostReasonAction({ id: lostReasonId }));
  };

  private commit = async (request: Promise<MutationOutcome>): Promise<boolean> => {
    this.setSaving(true);

    try {
      const result = await request;

      if (!result.ok) {
        toastZodErrorTree(result.error);
        return false;
      }

      await this.reload();
      return true;
    } finally {
      this.setSaving(false);
    }
  };

  private reload = async (): Promise<void> => {
    try {
      this.applyLostReasons(await getLostReasonsAction());
      this.setLoadError(false);
    } catch (error) {
      reportApplicationError(error);
      this.setLoadError(true);
    }
  };
}
