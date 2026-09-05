import type { RootStore } from "@/core/stores/root.store";
import type { PipelineDto, PipelineStageDto } from "@/features/pipelines/pipeline.schema";

import { action, computed, makeObservable, observable } from "mobx";
import { Resource, StageKind } from "@/generated/prisma";

import {
  createPipelineAction,
  createStageAction,
  deletePipelineAction,
  deleteStageAction,
  getPipelinesAction,
  reorderStagesAction,
  updatePipelineAction,
  updateStageAction,
} from "../../actions";

import { BaseStore } from "@/core/base/base.store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { reportApplicationError } from "@/core/errors/report-application-error";

export type NewPipelineStageInput = {
  name: string;
  probability?: number;
  rottingDays?: number | null;
  kind?: StageKind;
};

export type NewPipelineInput = {
  name: string;
  isDefault?: boolean;
  stages: NewPipelineStageInput[];
};

export type NewStageInput = NewPipelineStageInput & {
  pipelineId: string;
};

export type StageDeletionPrompt = {
  stageId: string;
  pipelineId: string | null;
  dealCount: number;
};

type MutationOutcome = { ok: true } | { ok: false; error: unknown };

function byPosition(first: { position: number }, second: { position: number }): number {
  return first.position - second.position;
}

function withOrderedStages(pipeline: PipelineDto): PipelineDto {
  return { ...pipeline, stages: [...pipeline.stages].sort(byPosition) };
}

export class PipelinesStore extends BaseStore {
  get canManage(): boolean {
    return this.rootStore.userStore.canManage(Resource.pipelines);
  }

  pipelines: PipelineDto[] = [];
  selectedPipelineId: string | null = null;
  isLoading = false;
  isSaving = false;
  hasLoadError = false;
  stageDeletionPrompt: StageDeletionPrompt | null = null;

  constructor(rootStore: RootStore) {
    super(rootStore);

    makeObservable(this, {
      canManage: computed,
      pipelines: observable,
      selectedPipelineId: observable,
      isLoading: observable,
      isSaving: observable,
      hasLoadError: observable,
      stageDeletionPrompt: observable,
      sortedPipelines: computed,
      activePipelines: computed,
      selectedPipeline: computed,
      selectedStages: computed,
      stageDeletionTargets: computed,
      applyPipelines: action,
      selectPipeline: action,
      setLoading: action,
      setSaving: action,
      setLoadError: action,
      setStageDeletionPrompt: action,
      clearStageDeletionPrompt: action,
    });
  }

  get sortedPipelines(): PipelineDto[] {
    return [...this.pipelines].sort(byPosition).map(withOrderedStages);
  }

  get activePipelines(): PipelineDto[] {
    return this.sortedPipelines.filter((pipeline) => pipeline.archivedAt === null);
  }

  get selectedPipeline(): PipelineDto | null {
    const selectedPipelineId = this.selectedPipelineId;
    if (selectedPipelineId === null) return null;

    return this.sortedPipelines.find((pipeline) => pipeline.id === selectedPipelineId) ?? null;
  }

  get selectedStages(): PipelineStageDto[] {
    return this.selectedPipeline?.stages ?? [];
  }

  get stageDeletionTargets(): PipelineStageDto[] {
    const prompt = this.stageDeletionPrompt;
    if (!prompt) return [];

    const pipeline = this.sortedPipelines.find((entry) => entry.id === prompt.pipelineId);

    return (pipeline?.stages ?? []).filter((stage) => stage.id !== prompt.stageId);
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

  setStageDeletionPrompt = (stageDeletionPrompt: StageDeletionPrompt) => {
    this.stageDeletionPrompt = stageDeletionPrompt;
  };

  clearStageDeletionPrompt = () => {
    this.stageDeletionPrompt = null;
  };

  applyPipelines = (pipelines: PipelineDto[]) => {
    this.pipelines = pipelines;

    const stillSelected = pipelines.some((pipeline) => pipeline.id === this.selectedPipelineId);
    if (!stillSelected) this.selectedPipelineId = preferredPipelineId(pipelines);
  };

  selectPipeline = (pipelineId: string | null) => {
    this.selectedPipelineId = pipelineId;
    this.stageDeletionPrompt = null;
  };

  load = async (): Promise<void> => {
    this.setLoading(true);
    this.setLoadError(false);

    try {
      this.applyPipelines(await getPipelinesAction());
    } catch (error) {
      reportApplicationError(error);
      this.setLoadError(true);
    } finally {
      this.setLoading(false);
    }
  };

  createPipeline = async (input: NewPipelineInput): Promise<boolean> => {
    return this.commit(
      createPipelineAction({
        name: input.name,
        position: this.pipelines.length,
        isDefault: input.isDefault ?? false,
        stages: input.stages.map((stage) => ({
          name: stage.name,
          probability: stage.probability ?? 0,
          rottingDays: stage.rottingDays ?? null,
          kind: stage.kind ?? StageKind.open,
        })),
      }),
    );
  };

  renamePipeline = async (pipelineId: string, name: string): Promise<boolean> => {
    return this.commit(updatePipelineAction({ id: pipelineId, name }));
  };

  setPipelineDefault = async (pipelineId: string): Promise<boolean> => {
    return this.commit(updatePipelineAction({ id: pipelineId, isDefault: true }));
  };

  archivePipeline = async (pipelineId: string): Promise<boolean> => {
    return this.commit(updatePipelineAction({ id: pipelineId, archivedAt: new Date() }));
  };

  unarchivePipeline = async (pipelineId: string): Promise<boolean> => {
    return this.commit(updatePipelineAction({ id: pipelineId, archivedAt: null }));
  };

  reorderPipelines = async (orderedPipelineIds: string[]): Promise<boolean> => {
    this.setSaving(true);

    try {
      for (const [position, pipelineId] of orderedPipelineIds.entries()) {
        const result = await updatePipelineAction({ id: pipelineId, position });

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

  deletePipeline = async (pipelineId: string): Promise<boolean> => {
    return this.commit(deletePipelineAction({ id: pipelineId }));
  };

  createStage = async (input: NewStageInput): Promise<boolean> => {
    return this.commit(
      createStageAction({
        pipelineId: input.pipelineId,
        name: input.name,
        probability: input.probability ?? 0,
        rottingDays: input.rottingDays ?? null,
        kind: input.kind ?? StageKind.open,
      }),
    );
  };

  renameStage = async (stageId: string, name: string): Promise<boolean> => {
    return this.commit(updateStageAction({ id: stageId, name }));
  };

  setStageProbability = async (stageId: string, probability: number): Promise<boolean> => {
    return this.commit(updateStageAction({ id: stageId, probability }));
  };

  setStageKind = async (stageId: string, kind: StageKind): Promise<boolean> => {
    return this.commit(updateStageAction({ id: stageId, kind }));
  };

  setStageRottingDays = async (stageId: string, rottingDays: number | null): Promise<boolean> => {
    return this.commit(updateStageAction({ id: stageId, rottingDays }));
  };

  reorderStages = async (pipelineId: string, orderedStageIds: string[]): Promise<boolean> => {
    return this.commit(reorderStagesAction({ pipelineId, stageIds: orderedStageIds }));
  };

  deleteStage = async (stageId: string): Promise<boolean> => {
    return this.submitStageDeletion(stageId);
  };

  confirmStageDeletion = async (moveToStageId: string): Promise<boolean> => {
    const prompt = this.stageDeletionPrompt;
    if (!prompt) return false;

    return this.submitStageDeletion(prompt.stageId, moveToStageId);
  };

  cancelStageDeletion = () => {
    this.clearStageDeletionPrompt();
  };

  private submitStageDeletion = async (stageId: string, moveToStageId?: string): Promise<boolean> => {
    this.setSaving(true);

    try {
      const result = await deleteStageAction({ id: stageId, moveToStageId });

      if (result.ok) {
        this.clearStageDeletionPrompt();
        await this.reload();
        return true;
      }

      if (result.conflict) {
        this.setStageDeletionPrompt({
          stageId,
          pipelineId: this.pipelineIdOfStage(stageId),
          dealCount: result.conflict.dealCount,
        });
        return false;
      }

      this.clearStageDeletionPrompt();
      toastZodErrorTree(result.error);
      return false;
    } finally {
      this.setSaving(false);
    }
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
      this.applyPipelines(await getPipelinesAction());
      this.setLoadError(false);
    } catch (error) {
      reportApplicationError(error);
      this.setLoadError(true);
    }
  };

  private pipelineIdOfStage = (stageId: string): string | null => {
    const pipeline = this.pipelines.find((entry) => entry.stages.some((stage) => stage.id === stageId));

    return pipeline?.id ?? null;
  };
}

function preferredPipelineId(pipelines: PipelineDto[]): string | null {
  const ordered = [...pipelines].sort(byPosition);
  const preferred = ordered.find((pipeline) => pipeline.isDefault && pipeline.archivedAt === null) ?? ordered[0];

  return preferred?.id ?? null;
}
