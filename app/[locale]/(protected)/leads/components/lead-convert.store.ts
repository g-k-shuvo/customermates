import type { LeadDto } from "@/features/leads/lead.schema";
import type { RootStore } from "@/core/stores/root.store";

import { action, makeObservable, observable } from "mobx";

import { convertLeadToDealAction } from "../actions";

import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

export function canConvertLead(lead: Pick<LeadDto, "convertedDealId"> | null | undefined): boolean {
  return Boolean(lead) && !lead?.convertedDealId;
}

export class LeadConvertStore {
  isSubmitting = false;

  constructor(private rootStore: RootStore) {
    makeObservable(this, {
      isSubmitting: observable,
      setSubmitting: action,
    });
  }

  setSubmitting = (isSubmitting: boolean) => {
    this.isSubmitting = isSubmitting;
  };

  convert = async (leadId: string): Promise<string | null> => {
    this.setSubmitting(true);

    try {
      const result = await convertLeadToDealAction({ id: leadId });

      if (!result.ok) {
        toastZodErrorTree(result.error);
        return null;
      }

      await this.refreshAffectedViews(leadId);

      return result.data.id;
    } finally {
      this.setSubmitting(false);
    }
  };

  private refreshAffectedViews = async (leadId: string): Promise<void> => {
    const { leadDetailStore, leadsStore, dealsStore } = this.rootStore;

    if (leadsStore.isReady) await leadsStore.refresh();
    if (dealsStore.isReady) await dealsStore.refresh();
    if (leadDetailStore.fetchedEntity?.id === leadId) await leadDetailStore.loadById(leadId);
  };
}
