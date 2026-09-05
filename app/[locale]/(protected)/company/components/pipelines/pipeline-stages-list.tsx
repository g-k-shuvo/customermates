"use client";

import type { DragEndEvent } from "@dnd-kit/core";
import type { PipelineStageDto } from "@/features/pipelines/pipeline.schema";

import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { AlignJustify, Plus, Trash2 } from "lucide-react";
import { DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { StageKind } from "@/generated/prisma";

import { FormNumberInput } from "@/components/forms/form-number-input";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/shared/icon";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";
import { cn } from "@/core/utils/cn";

const STAGE_KINDS: StageKind[] = [StageKind.open, StageKind.won, StageKind.lost];

export function selectableStageKinds(stages: PipelineStageDto[], stageId: string): StageKind[] {
  const claimed = new Set(
    stages.filter((stage) => stage.id !== stageId && stage.kind !== StageKind.open).map((stage) => stage.kind),
  );

  return STAGE_KINDS.filter((kind) => kind === StageKind.open || !claimed.has(kind));
}

export function clampProbability(value: number | undefined, fallback: number): number {
  if (value === undefined || Number.isNaN(value)) return fallback;

  return Math.min(100, Math.max(0, Math.round(value)));
}

type StageRowProps = {
  stage: PipelineStageDto;
  index: number;
  isDisabled: boolean;
  kinds: StageKind[];
  onRename: (name: string) => void;
  onProbabilityChange: (probability: number) => void;
  onKindChange: (kind: StageKind) => void;
  onDelete: () => void;
};

const SortableStageRow = observer(
  ({ stage, index, isDisabled, kinds, onRename, onProbabilityChange, onKindChange, onDelete }: StageRowProps) => {
    const t = useTranslations();
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
      id: stage.id,
      disabled: isDisabled,
    });
    const [draftName, setDraftName] = useState(stage.name);
    const [draftProbability, setDraftProbability] = useState<number | undefined>(stage.probability);

    useEffect(() => {
      setDraftName(stage.name);
    }, [stage.name]);

    useEffect(() => {
      setDraftProbability(stage.probability);
    }, [stage.probability]);

    function commitName() {
      const next = draftName.trim();
      if (next === "" || next === stage.name) {
        setDraftName(stage.name);
        return;
      }

      onRename(next);
    }

    function commitProbability() {
      const next = clampProbability(draftProbability, stage.probability);
      setDraftProbability(next);
      if (next !== stage.probability) onProbabilityChange(next);
    }

    function kindLabel(kind: StageKind): string {
      if (kind === StageKind.won) return t("Pipelines.stageKinds.won");
      if (kind === StageKind.lost) return t("Pipelines.stageKinds.lost");

      return t("Pipelines.stageKinds.open");
    }

    return (
      <li
        ref={setNodeRef}
        className="flex items-center gap-2"
        style={{ transform: CSS.Transform.toString(transform), transition }}
      >
        <span
          aria-label={t("Pipelines.reorderStageLabel", { name: stage.name })}
          className={cn(
            "flex items-center text-muted-foreground",
            isDisabled ? "opacity-50" : "cursor-move hover:text-foreground",
          )}
          role="button"
          tabIndex={isDisabled ? -1 : 0}
          {...(isDisabled ? {} : { ...attributes, ...listeners })}
        >
          <Icon className="size-4" icon={AlignJustify} />
        </span>

        <Input
          aria-label={t("Pipelines.stageNameLabel", { name: stage.name })}
          className="h-9 min-w-0 flex-1"
          disabled={isDisabled}
          value={draftName}
          onBlur={commitName}
          onChange={(event) => setDraftName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />

        <Select disabled={isDisabled} value={stage.kind} onValueChange={(next) => onKindChange(next as StageKind)}>
          <SelectTrigger
            aria-label={t("Pipelines.stageKindLabel", { name: stage.name })}
            className="h-9 w-32 shrink-0"
            id={`pipelineStages[${index}].kind`}
          >
            <SelectValue />
          </SelectTrigger>

          <SelectContent>
            {kinds.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {kindLabel(kind)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <FormNumberInput
          aria-label={t("Pipelines.probabilityLabel", { name: stage.name })}
          className="text-right"
          containerClassName="w-24 shrink-0"
          disabled={isDisabled}
          endContent="%"
          id={`pipelineStages[${index}].probability`}
          label={null}
          value={draftProbability}
          onBlur={commitProbability}
          onValueChange={setDraftProbability}
        />

        <Button
          aria-label={t("Pipelines.deleteStageLabel", { name: stage.name })}
          disabled={isDisabled}
          size="icon-sm"
          type="button"
          variant="ghost"
          onClick={onDelete}
        >
          <Icon className="size-4" icon={Trash2} />
        </Button>
      </li>
    );
  },
);

export const PipelineStagesList = observer(() => {
  const t = useTranslations();
  const { pipelinesStore: store, deleteConfirmationModalStore } = useRootStore();
  const { showDeleteConfirmation } = useDeleteConfirmation();
  const [newStageName, setNewStageName] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const pipeline = store.selectedPipeline;
  if (!pipeline) return null;

  const pipelineId = pipeline.id;
  const stages = store.selectedStages;
  const isDisabled = store.isSaving || !store.canManage;

  async function reorder(event: DragEndEvent): Promise<void> {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const ids = stages.map((stage) => stage.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;

    await store.reorderStages(pipelineId, arrayMove(ids, from, to));
  }

  async function addStage(): Promise<void> {
    const name = newStageName.trim();
    if (name === "") return;

    const created = await store.createStage({ pipelineId, name });
    if (created) setNewStageName("");
  }

  function confirmStageDelete(stage: PipelineStageDto): void {
    showDeleteConfirmation(async () => {
      const deleted = await store.deleteStage(stage.id);
      if (!deleted) deleteConfirmationModalStore.close();

      return deleted;
    }, stage.name);
  }

  return (
    <section data-pipeline-stages className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">{t("Pipelines.stagesTitle", { name: pipeline.name })}</h3>

      {stages.length === 0 ? (
        <p className="text-subdued text-xs">{t("Pipelines.noStages")}</p>
      ) : (
        <DndContext sensors={sensors} onDragEnd={(event) => runUserAction(() => reorder(event))}>
          <SortableContext items={stages.map((stage) => stage.id)} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-2">
              {stages.map((stage, index) => (
                <SortableStageRow
                  key={stage.id}
                  index={index}
                  isDisabled={isDisabled}
                  kinds={selectableStageKinds(stages, stage.id)}
                  stage={stage}
                  onDelete={() => confirmStageDelete(stage)}
                  onKindChange={(kind) => runUserAction(() => store.setStageKind(stage.id, kind))}
                  onProbabilityChange={(probability) =>
                    runUserAction(() => store.setStageProbability(stage.id, probability))
                  }
                  onRename={(name) => runUserAction(() => store.renameStage(stage.id, name))}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <div className="flex items-center gap-2 pl-6">
        <Input
          aria-label={t("Pipelines.newStageName")}
          className="h-9 min-w-0 flex-1"
          disabled={isDisabled}
          placeholder={t("Pipelines.newStageName")}
          value={newStageName}
          onChange={(event) => setNewStageName(event.target.value)}
        />

        <Button
          disabled={isDisabled || newStageName.trim() === ""}
          size="sm"
          type="button"
          variant="secondary"
          onClick={() => runUserAction(() => addStage())}
        >
          <Icon className="size-4" icon={Plus} />

          {t("Pipelines.addStage")}
        </Button>
      </div>
    </section>
  );
});
