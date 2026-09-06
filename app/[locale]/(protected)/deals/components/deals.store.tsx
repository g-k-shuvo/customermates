import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { RootStore } from "@/core/stores/root.store";
import type { StageMoveOutcome, TableColumn } from "@/core/base/base-data-view.store";
import type { DealDto } from "@/features/deals/deal.schema";
import type { PipelineDto } from "@/features/pipelines/pipeline.schema";

import { action, computed, makeObservable, observable } from "mobx";

import { EntityType, Resource, StageKind } from "@/generated/prisma";

import { getDealsAction } from "../actions";

import {
  DEAL_STATUS_FILTER_FIELD,
  DEFAULT_DEAL_STATUS_FILTER,
  selectedPipelineFilterId,
  shouldSeedDefaultDealStatusFilter,
  withPipelineFilter,
} from "./deal-board-filters";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";

export type DealStageOption = { id: string; name: string; probability: number; pipelineId: string; kind: StageKind };

export type DealPipelineOption = { id: string; name: string; isDefault: boolean; isArchived: boolean };

export class DealsStore extends BaseDataViewStore<DealDto> {
  stages: DealStageOption[] = [];
  pipelines: DealPipelineOption[] = [];
  hasSeededDefaultStatusFilter = false;

  constructor(rootStore: RootStore) {
    super(rootStore, Resource.deals, EntityType.deal);

    makeObservable(this, {
      stages: observable,
      pipelines: observable,
      hasSeededDefaultStatusFilter: observable,
      stageById: computed,
      selectedPipelineId: computed,
      selectedPipeline: computed,
      defaultPipelineId: computed,
      setPipelineCatalog: action,
      seedDefaultStatusFilter: action,
      selectPipeline: action,
    });
  }

  setPipelineCatalog = (pipelines: PipelineDto[]) => {
    this.pipelines = pipelines.map((pipeline) => ({
      id: pipeline.id,
      name: pipeline.name,
      isDefault: pipeline.isDefault,
      isArchived: pipeline.archivedAt !== null,
    }));

    this.stages = pipelines.flatMap((pipeline) =>
      pipeline.stages.map((stage) => ({
        id: stage.id,
        name: stage.name,
        probability: stage.probability,
        pipelineId: pipeline.id,
        kind: stage.kind,
      })),
    );
  };

  get stageById(): Map<string, DealStageOption> {
    return new Map(this.stages.map((stage) => [stage.id, stage]));
  }

  get selectedPipelineId(): string | null {
    return selectedPipelineFilterId(this.filters);
  }

  get defaultPipelineId(): string | null {
    const selectable = this.pipelines.filter((pipeline) => !pipeline.isArchived);

    return (selectable.find((pipeline) => pipeline.isDefault) ?? selectable[0])?.id ?? null;
  }

  get selectedPipeline(): DealPipelineOption | null {
    const selectedPipelineId = this.selectedPipelineId;
    if (selectedPipelineId === null) return null;

    return this.pipelines.find((pipeline) => pipeline.id === selectedPipelineId) ?? null;
  }

  stagesForPipeline = (pipelineId: string | null): DealStageOption[] => {
    if (pipelineId === null) return this.stages;

    return this.stages.filter((stage) => stage.pipelineId === pipelineId);
  };

  selectPipeline = (pipelineId: string | null) => {
    if (this.selectedPipelineId === pipelineId) return;

    this.setQueryOptions({ filters: withPipelineFilter(this.filters, pipelineId) });
  };

  ensurePipelinesLoaded = async (): Promise<void> => {
    if (this.pipelines.length > 0) return;
    if (!this.rootStore.userStore.canAccess(Resource.pipelines)) return;

    const pipelinesStore = this.rootStore.pipelinesStore;

    if (pipelinesStore.pipelines.length === 0) {
      if (pipelinesStore.isLoading) return;

      await pipelinesStore.load();
    }

    this.setPipelineCatalog(pipelinesStore.pipelines);
  };

  seedDefaultStatusFilter = () => {
    if (this.hasSeededDefaultStatusFilter) return;
    this.hasSeededDefaultStatusFilter = true;

    if (!this.isReady) return;
    if (!this.filterableFields.some((field) => field.field === DEAL_STATUS_FILTER_FIELD)) return;
    if (!shouldSeedDefaultDealStatusFilter({ filters: this.filters, searchTerm: this.searchTerm })) return;

    this.setQueryOptions({ filters: [DEFAULT_DEAL_STATUS_FILTER] });
  };

  get canAccessOrganizations() {
    return this.rootStore.userStore.canAccess(Resource.organizations);
  }

  get canAccessContacts() {
    return this.rootStore.userStore.canAccess(Resource.contacts);
  }

  get canAccessServices() {
    return this.rootStore.userStore.canAccess(Resource.services);
  }

  get canAccessTasks() {
    return this.rootStore.userStore.canAccess(Resource.tasks);
  }

  get columnsDefinition() {
    const columns: (TableColumn | false)[] = [
      { uid: "name", sortable: true },
      { uid: "status" },
      { uid: "rottingAt", sortable: true },
      this.canAccessTasks && { uid: "nextActivity" },
      { uid: "totalValue", sortable: true },
      { uid: "weightedValue", sortable: true },
      { uid: "totalQuantity", sortable: true },
      this.canAccessContacts && { uid: "contacts" },
      this.canAccessOrganizations && { uid: "organizations" },
      this.canAccessServices && { uid: "services" },
      this.canAccessTasks && { uid: "tasks" },
      ...this.customColumns.map((column) => ({ uid: column.id, label: column.label, sortable: true })),
      { uid: "users" },
      { uid: "updatedAt", sortable: true },
      { uid: "createdAt", sortable: true },
    ];

    return columns.filter((col): col is TableColumn => Boolean(col));
  }

  protected async persistStageMove(entityId: string, stageId: string | null): Promise<StageMoveOutcome> {
    const kind = stageId === null ? undefined : this.stageById.get(stageId)?.kind;

    if (kind === StageKind.won) {
      const closed = await this.rootStore.dealCloseStore.markWon(entityId);

      return closed ? { status: "handled" } : { status: "cancelled" };
    }

    if (kind === StageKind.lost) {
      const closed = await this.rootStore.dealCloseStore.requestLost(entityId);

      return closed ? { status: "handled" } : { status: "cancelled" };
    }

    return super.persistStageMove(entityId, stageId);
  }

  protected async refreshAction(params?: GetQueryParams) {
    return await getDealsAction(params);
  }
}
