import type { LeadDto } from "@/features/leads/lead.schema";
import type { RootStore } from "@/core/stores/root.store";
import type { DealPipelineOption, DealStageOption } from "../../deals/components/deals.store";

import { action, computed, makeObservable, observable } from "mobx";
import { Resource, StageKind } from "@/generated/prisma";

import { convertLeadToDealAction } from "../actions";

import { BaseFormStore } from "@/core/base/base-form.store";

export function canConvertLead(lead: Pick<LeadDto, "convertedDealId"> | null | undefined): boolean {
  return Boolean(lead) && !lead?.convertedDealId;
}

export type LeadConvertFormData = {
  name: string;
  baseValue: number | undefined;
  pipelineId: string | undefined;
  stageId: string | undefined;
  expectedCloseDate: string | undefined;
  probability: number | undefined;
};

const EMPTY_FORM: LeadConvertFormData = {
  name: "",
  baseValue: undefined,
  pipelineId: undefined,
  stageId: undefined,
  expectedCloseDate: undefined,
  probability: undefined,
};

export class LeadConvertStore extends BaseFormStore<LeadConvertFormData> {
  targetLead: Pick<LeadDto, "id" | "title"> | null = null;
  isSubmitting = false;
  isLoadingPlacement = false;

  constructor(rootStore: RootStore) {
    super(rootStore, EMPTY_FORM, Resource.deals);

    this.setWithUnsavedChangesGuard(false);

    makeObservable(this, {
      targetLead: observable,
      isSubmitting: observable,
      isLoadingPlacement: observable,
      isOpen: computed,
      canChoosePlacement: computed,
      pipelineOptions: computed,
      stageOptions: computed,
      selectedStage: computed,
      canSubmit: computed,
      setSubmitting: action,
      setLoadingPlacement: action,
      open: action,
      close: action,
      applyDefaultPlacement: action,
      selectPipeline: action,
      selectStage: action,
    });
  }

  get isOpen(): boolean {
    return this.targetLead !== null;
  }

  get canChoosePlacement(): boolean {
    return this.rootStore.userStore.canAccess(Resource.pipelines);
  }

  get pipelineOptions(): DealPipelineOption[] {
    return this.rootStore.dealsStore.pipelines.filter((pipeline) => !pipeline.isArchived);
  }

  get stageOptions(): DealStageOption[] {
    if (!this.form.pipelineId) return [];

    return this.rootStore.dealsStore
      .stagesForPipeline(this.form.pipelineId)
      .filter((stage) => stage.kind === StageKind.open);
  }

  get selectedStage(): DealStageOption | undefined {
    return this.stageOptions.find((stage) => stage.id === this.form.stageId);
  }

  get canSubmit(): boolean {
    return this.isOpen && this.form.name.trim() !== "" && !this.isSubmitting && !this.isLoadingPlacement;
  }

  setSubmitting = (isSubmitting: boolean) => {
    this.isSubmitting = isSubmitting;
  };

  setLoadingPlacement = (isLoadingPlacement: boolean) => {
    this.isLoadingPlacement = isLoadingPlacement;
  };

  open = (lead: Pick<LeadDto, "id" | "title" | "value">) => {
    this.targetLead = { id: lead.id, title: lead.title };
    this.onInitOrRefresh({ ...EMPTY_FORM, name: lead.title, baseValue: lead.value ?? undefined });
    this.applyDefaultPlacement();
  };

  prepare = async (lead: Pick<LeadDto, "id" | "title" | "value">): Promise<void> => {
    this.open(lead);
    this.setLoadingPlacement(true);

    try {
      await this.rootStore.dealsStore.ensurePipelinesLoaded();
    } finally {
      this.setLoadingPlacement(false);
    }

    if (this.targetLead?.id === lead.id) this.applyDefaultPlacement();
  };

  close = () => {
    this.targetLead = null;
    this.onInitOrRefresh(EMPTY_FORM);
  };

  applyDefaultPlacement = () => {
    if (this.form.pipelineId) return;

    const pipelineId = this.rootStore.dealsStore.defaultPipelineId;
    if (pipelineId) this.selectPipeline(pipelineId);
  };

  selectPipeline = (pipelineId: string) => {
    if (!pipelineId || pipelineId === this.form.pipelineId) return;

    this.onChange("pipelineId", pipelineId);
    this.onChange("stageId", this.stageOptions[0]?.id);
  };

  selectStage = (stageId: string) => {
    if (stageId) this.onChange("stageId", stageId);
  };

  confirm = async (): Promise<string | null> => {
    const leadId = this.targetLead?.id;
    if (!leadId || !this.canSubmit) return null;

    const { name, baseValue, pipelineId, stageId, expectedCloseDate, probability } = this.form;
    this.setSubmitting(true);

    try {
      const result = await convertLeadToDealAction({
        id: leadId,
        name: name.trim(),
        baseValue,
        pipelineId,
        stageId,
        expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : undefined,
        probability,
      });

      if (!result.ok) {
        this.setError(result.error);
        return null;
      }

      this.close();
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
