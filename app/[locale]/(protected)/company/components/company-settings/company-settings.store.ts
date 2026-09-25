import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { GroupValueSums } from "@/core/base/base-get.schema";
import type { EntityType } from "@/generated/prisma";
import type { PipelineDto } from "@/features/pipelines/pipeline.schema";
import type { ForecastingRequestStatus } from "./company-forecasting-state";
import type {
  EntityTerminologyOverride,
  TerminologySelectionMap,
} from "@/features/entity-terminology/entity-terminology.types";

import { action, computed, makeObservable, observable, toJS } from "mobx";
import { cloneDeep } from "lodash";
import equal from "fast-deep-equal/es6";
import { Currency, Resource } from "@/generated/prisma";

import { NO_VALUE_GROUP_KEY } from "@/core/base/grouping/grouping.schema";
import { DEAL_GROUP_SUM_FIELDS } from "@/features/deals/deal-weighting";

import { getDealStageValueSumsAction, getPipelinesAction, updateCompanyAction, updateStageAction } from "../../actions";

import { BaseFormStore } from "@/core/base/base-form.store";
import {
  defaultTerminologySelections,
  isTerminologyPresetKey,
  terminologySelectionsFromOverrides,
  terminologySelectionsToEntries,
} from "@/features/entity-terminology/entity-terminology.constants";

export type DealPipelineStage = {
  id: string;
  name: string;
  probability: number;
  pipelineName: string;
};

type StageProbabilityDraft = {
  stageId: string;
  probability: number | undefined;
};

type CompanySettingsFormData = {
  currency: Currency;
  terminology: TerminologySelectionMap;
  stageProbabilities: StageProbabilityDraft[];
};

function toPipelineStages(pipelines: PipelineDto[]): DealPipelineStage[] {
  return [...pipelines]
    .filter((entry) => entry.archivedAt === null)
    .sort((first, second) => Number(second.isDefault) - Number(first.isDefault) || first.position - second.position)
    .flatMap((pipeline) =>
      [...pipeline.stages]
        .sort((first, second) => first.position - second.position)
        .map((stage) => ({
          id: stage.id,
          name: stage.name,
          probability: stage.probability,
          pipelineName: pipeline.name,
        })),
    );
}

export class CompanySettingsStore extends BaseFormStore<CompanySettingsFormData> {
  public pipelineStages: DealPipelineStage[] = [];
  public stageValueSums: Record<string, GroupValueSums> | undefined = undefined;
  public forecastingRequest: ForecastingRequestStatus = "uninitialized";

  constructor(rootStore: RootStore) {
    super(
      rootStore,
      {
        currency: Currency.eur,
        terminology: defaultTerminologySelections(),
        stageProbabilities: [],
      },
      Resource.company,
    );

    makeObservable(this, {
      pipelineStages: observable,
      stageValueSums: observable,
      forecastingRequest: observable,
      pipelineTotal: computed,
      unweightedPipelineTotal: computed,
      weightedPipelineTotal: computed,
      hasForecastingChanges: computed,
      onSubmit: action,
      initTerminology: action,
      setTerminologyPreset: action,
      setForecastingRequest: action,
      applyPipelineStages: action,
      applyStageValueSums: action,
    });
  }

  get pipelineTotal(): number {
    const stageValueSums = this.stageValueSums;
    if (!stageValueSums) return 0;

    return (
      this.form.stageProbabilities.reduce(
        (total, { stageId }) => total + (stageValueSums[stageId]?.[DEAL_GROUP_SUM_FIELDS.total] ?? 0),
        0,
      ) + this.unweightedPipelineTotal
    );
  }

  get unweightedPipelineTotal(): number {
    const stageValueSums = this.stageValueSums;
    if (!stageValueSums) return 0;

    return stageValueSums[NO_VALUE_GROUP_KEY]?.[DEAL_GROUP_SUM_FIELDS.total] ?? 0;
  }

  get weightedPipelineTotal(): number {
    const stageValueSums = this.stageValueSums;
    if (!stageValueSums) return 0;

    return this.form.stageProbabilities.reduce(
      (total, { stageId, probability }) =>
        total + ((stageValueSums[stageId]?.[DEAL_GROUP_SUM_FIELDS.total] ?? 0) * (probability ?? 0)) / 100,
      0,
    );
  }

  get hasForecastingChanges(): boolean {
    return !equal(this.form.stageProbabilities, this.savedState.stageProbabilities);
  }

  initTerminology = (overrides: EntityTerminologyOverride[]) => {
    const terminology = terminologySelectionsFromOverrides(overrides);
    this.form = { ...this.form, terminology };
    this.savedState = {
      ...this.savedState,
      terminology: cloneDeep(terminology),
    };
  };

  setTerminologyPreset = (entityType: EntityType, presetKey: string) => {
    if (!isTerminologyPresetKey(entityType, presetKey)) return;

    this.form = {
      ...this.form,
      terminology: { ...this.form.terminology, [entityType]: presetKey },
    };
  };

  setForecastingRequest = (forecastingRequest: ForecastingRequestStatus) => {
    this.forecastingRequest = forecastingRequest;
  };

  applyPipelineStages = (pipelineStages: DealPipelineStage[]) => {
    this.pipelineStages = pipelineStages;

    const stageProbabilities = pipelineStages.map((stage) => ({
      stageId: stage.id,
      probability: stage.probability,
    }));

    this.form = { ...this.form, stageProbabilities };
    this.savedState = {
      ...this.savedState,
      stageProbabilities: cloneDeep(stageProbabilities),
    };
  };

  applyStageValueSums = (stageValueSums: Record<string, GroupValueSums>) => {
    this.stageValueSums = stageValueSums;
    this.forecastingRequest = "ready";
  };

  loadForecasting = async () => {
    this.setForecastingRequest("loading");

    try {
      this.applyPipelineStages(toPipelineStages(await getPipelinesAction()));

      const result = await getDealStageValueSumsAction();

      if (result.ok) this.applyStageValueSums(result.data);
      else this.setForecastingRequest("error");
    } catch {
      this.setForecastingRequest("error");
    }
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    this.setIsLoading(true);

    try {
      const result = await updateCompanyAction({
        currency: this.form.currency,
        terminology: terminologySelectionsToEntries(this.form.terminology),
      });

      if (!result.ok) {
        this.setError(result.error);
        return;
      }

      const stageFailure = this.hasForecastingChanges ? await this.saveStageProbabilities() : undefined;

      if (stageFailure) {
        this.setError(stageFailure);
        return;
      }

      const company = this.rootStore.companyStore.company;
      if (company) this.rootStore.companyStore.setCompany({ ...company, currency: this.form.currency });

      await this.rootStore.terminologyStore.refresh();
      this.onInitOrRefresh({
        currency: this.form.currency,
        terminology: toJS(this.form.terminology),
        stageProbabilities: toJS(this.form.stageProbabilities),
      });
    } finally {
      this.setIsLoading(false);
    }
  };

  private saveStageProbabilities = async () => {
    const savedProbabilities = new Map(
      this.savedState.stageProbabilities.map(({ stageId, probability }) => [stageId, probability]),
    );

    for (const { stageId, probability } of toJS(this.form.stageProbabilities)) {
      const nextProbability = probability ?? 0;

      if (nextProbability === savedProbabilities.get(stageId)) continue;

      const result = await updateStageAction({ id: stageId, probability: nextProbability });

      if (!result.ok) return result.error;
    }

    return undefined;
  };
}
