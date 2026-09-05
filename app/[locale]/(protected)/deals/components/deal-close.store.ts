import type { RootStore } from "@/core/stores/root.store";
import type { LostReasonDto } from "@/features/lost-reasons/lost-reason.schema";

import { action, computed, makeObservable, observable } from "mobx";
import { Resource } from "@/generated/prisma";

import { markDealLostAction, markDealWonAction, reopenDealAction } from "../actions";

import { BaseFormStore } from "@/core/base/base-form.store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

export type MarkDealLostFormData = {
  lostReasonId: string;
  lostNotes: string;
};

type TransitionOutcome = { ok: true } | { ok: false; error: unknown };

const EMPTY_LOST_FORM: MarkDealLostFormData = { lostReasonId: "", lostNotes: "" };

export class DealCloseStore extends BaseFormStore<MarkDealLostFormData> {
  targetDealId: string | null = null;
  isSubmitting = false;

  private lostPromptSettle: ((confirmed: boolean) => void) | null = null;

  constructor(rootStore: RootStore) {
    super(rootStore, EMPTY_LOST_FORM, Resource.deals);

    this.setWithUnsavedChangesGuard(false);

    makeObservable(this, {
      targetDealId: observable,
      isSubmitting: observable,
      isLostPromptOpen: computed,
      lostReasons: computed,
      canSubmitLost: computed,
      setSubmitting: action,
      closeLostPrompt: action,
      startLostPrompt: action,
    });
  }

  get isLostPromptOpen(): boolean {
    return this.targetDealId !== null;
  }

  get lostReasons(): LostReasonDto[] {
    return this.rootStore.lostReasonsStore.activeLostReasons;
  }

  get canSubmitLost(): boolean {
    return this.form.lostReasonId !== "" && !this.isSubmitting;
  }

  setSubmitting = (isSubmitting: boolean) => {
    this.isSubmitting = isSubmitting;
  };

  startLostPrompt = (dealId: string) => {
    this.targetDealId = dealId;
    this.onInitOrRefresh(EMPTY_LOST_FORM);
  };

  closeLostPrompt = () => {
    this.targetDealId = null;
    this.onInitOrRefresh(EMPTY_LOST_FORM);
    this.takeLostPromptSettle()?.(false);
  };

  openLostPrompt = async (dealId: string): Promise<void> => {
    this.startLostPrompt(dealId);

    await this.ensureLostReasonsLoaded();
  };

  requestLost = async (dealId: string): Promise<boolean> => {
    this.takeLostPromptSettle()?.(false);

    const outcome = new Promise<boolean>((settle) => {
      this.lostPromptSettle = settle;
    });

    await this.openLostPrompt(dealId);

    return await outcome;
  };

  markWon = async (dealId: string): Promise<boolean> => {
    return this.applyTransition(dealId, markDealWonAction({ id: dealId }));
  };

  reopen = async (dealId: string): Promise<boolean> => {
    return this.applyTransition(dealId, reopenDealAction({ id: dealId }));
  };

  confirmLost = async (): Promise<boolean> => {
    const dealId = this.targetDealId;
    const lostReasonId = this.form.lostReasonId;
    if (!dealId || lostReasonId === "") return false;

    const notes = this.form.lostNotes.trim();
    const settle = this.takeLostPromptSettle();

    const closed = await this.applyTransition(
      dealId,
      markDealLostAction({ id: dealId, lostReasonId, lostNotes: notes || null }),
    );

    if (closed) settle?.(true);
    else this.lostPromptSettle = settle;

    return closed;
  };

  private takeLostPromptSettle = (): ((confirmed: boolean) => void) | null => {
    const settle = this.lostPromptSettle;
    this.lostPromptSettle = null;

    return settle;
  };

  ensureLostReasonsLoaded = async (): Promise<void> => {
    const store = this.rootStore.lostReasonsStore;
    if (store.isLoading || store.lostReasons.length > 0) return;
    if (!this.rootStore.userStore.canAccess(Resource.company)) return;

    await store.load();
  };

  private applyTransition = async (dealId: string, request: Promise<TransitionOutcome>): Promise<boolean> => {
    this.setSubmitting(true);

    try {
      const result = await request;

      if (!result.ok) {
        toastZodErrorTree(result.error);
        return false;
      }

      if (this.targetDealId === dealId) this.closeLostPrompt();
      await this.refreshAffectedViews(dealId);

      return true;
    } finally {
      this.setSubmitting(false);
    }
  };

  private refreshAffectedViews = async (dealId: string): Promise<void> => {
    const { dealDetailStore, dealsStore } = this.rootStore;

    if (dealsStore.isReady) await dealsStore.refresh();
    if (dealDetailStore.fetchedEntity?.id === dealId) await dealDetailStore.loadById(dealId);
  };
}
