"use client";

import type { ReactNode } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import type { PipelineDto } from "@/features/pipelines/pipeline.schema";

import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useLocale, useTranslations } from "next-intl";
import { AlignJustify, Plus, Trash2, Workflow } from "lucide-react";
import { DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { EntityType } from "@/generated/prisma";

import { AppChip } from "@/components/chip/app-chip";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/shared/icon";
import { Input } from "@/components/ui/input";
import { PageState } from "@/components/page-state/page-state";
import { SettingsFieldSkeleton, SettingsFormSkeleton } from "@/components/forms/settings-form-skeleton";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { useRootStore } from "@/core/stores/root-store.provider";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { terminologyLabelForSentence } from "@/features/entity-terminology/entity-terminology-label.utils";
import { cn } from "@/core/utils/cn";

import { DeleteStageModal } from "./delete-stage-modal";
import { PipelineStagesList } from "./pipeline-stages-list";

export type PipelinesSectionState = "loading" | "error" | "empty" | "content";

type PipelinesSectionStateArgs = {
  isLoading: boolean;
  hasLoadError: boolean;
  hasPipelines: boolean;
};

export function resolvePipelinesSectionState({
  isLoading,
  hasLoadError,
  hasPipelines,
}: PipelinesSectionStateArgs): PipelinesSectionState {
  if (hasLoadError) return "error";
  if (isLoading) return "loading";

  return hasPipelines ? "content" : "empty";
}

type PipelineRowProps = {
  pipeline: PipelineDto;
  isSelected: boolean;
  isDisabled: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onSetDefault: () => void;
  onToggleArchived: () => void;
  onDelete: () => void;
};

const SortablePipelineRow = observer(
  ({
    pipeline,
    isSelected,
    isDisabled,
    onSelect,
    onRename,
    onSetDefault,
    onToggleArchived,
    onDelete,
  }: PipelineRowProps) => {
    const t = useTranslations();
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
      id: pipeline.id,
      disabled: isDisabled,
    });
    const [draftName, setDraftName] = useState(pipeline.name);

    useEffect(() => {
      setDraftName(pipeline.name);
    }, [pipeline.name]);

    function commitName() {
      const next = draftName.trim();
      if (next === "" || next === pipeline.name) {
        setDraftName(pipeline.name);
        return;
      }

      onRename(next);
    }

    return (
      <li
        ref={setNodeRef}
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-md border border-border p-2",
          isSelected && "border-ring bg-accent/40",
        )}
        style={{ transform: CSS.Transform.toString(transform), transition }}
      >
        <span
          aria-label={t("Pipelines.reorderPipelineLabel", { name: pipeline.name })}
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
          aria-label={t("Pipelines.pipelineNameLabel", { name: pipeline.name })}
          className="h-9 min-w-40 flex-1"
          disabled={isDisabled}
          value={draftName}
          onBlur={commitName}
          onChange={(event) => setDraftName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            event.currentTarget.blur();
          }}
        />

        {pipeline.isDefault ? (
          <AppChip>{t("Pipelines.defaultBadge")}</AppChip>
        ) : (
          <Button disabled={isDisabled} size="xs" type="button" variant="ghost" onClick={onSetDefault}>
            {t("Pipelines.setDefault")}
          </Button>
        )}

        {pipeline.archivedAt !== null && <AppChip variant="warning">{t("Pipelines.archivedBadge")}</AppChip>}

        <Button disabled={isDisabled} size="xs" type="button" variant="ghost" onClick={onToggleArchived}>
          {pipeline.archivedAt === null ? t("Pipelines.archive") : t("Pipelines.unarchive")}
        </Button>

        <Button
          aria-pressed={isSelected}
          disabled={isDisabled}
          size="sm"
          type="button"
          variant={isSelected ? "secondary" : "ghost"}
          onClick={onSelect}
        >
          {t("Pipelines.viewStages")}
        </Button>

        <Button
          aria-label={t("Pipelines.deletePipelineLabel", { name: pipeline.name })}
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

export const PipelinesSection = observer(() => {
  const locale = useLocale();
  const t = useTranslations();
  const { pipelinesStore: store, deleteConfirmationModalStore } = useRootStore();
  const { plural } = useEntityTerminology();
  const { showDeleteConfirmation } = useDeleteConfirmation();
  const deals = terminologyLabelForSentence(plural(EntityType.deal), locale);
  const [newPipelineName, setNewPipelineName] = useState("");
  const [isShowingArchived, setIsShowingArchived] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    void store.load().catch(reportApplicationError);
  }, [store]);

  const visiblePipelines = isShowingArchived ? store.sortedPipelines : store.activePipelines;
  const hasArchived = store.sortedPipelines.length > store.activePipelines.length;
  const isDisabled = store.isSaving || !store.canManage;

  const state = resolvePipelinesSectionState({
    isLoading: store.isLoading,
    hasLoadError: store.hasLoadError,
    hasPipelines: store.sortedPipelines.length > 0,
  });

  async function reorder(event: DragEndEvent): Promise<void> {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const ids = store.sortedPipelines.map((pipeline) => pipeline.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;

    await store.reorderPipelines(arrayMove(ids, from, to));
  }

  async function createPipeline(): Promise<void> {
    const name = newPipelineName.trim();
    if (name === "") return;

    const created = await store.createPipeline({
      name,
      stages: [{ name: t("Pipelines.defaultStageName") }],
    });
    if (created) setNewPipelineName("");
  }

  function confirmPipelineDelete(pipeline: PipelineDto): void {
    showDeleteConfirmation(async () => {
      const deleted = await store.deletePipeline(pipeline.id);
      if (!deleted) deleteConfirmationModalStore.close();

      return deleted;
    }, pipeline.name);
  }

  let body: ReactNode;

  switch (state) {
    case "loading":
      body = (
        <PageState
          background={
            <SettingsFormSkeleton className="gap-3">
              <SettingsFieldSkeleton animated short />

              <SettingsFieldSkeleton animated short />
            </SettingsFormSkeleton>
          }
          className="min-h-24"
          label={t("PageState.loading")}
          state="loading"
        />
      );
      break;
    case "error":
      body = (
        <PageState
          action={
            <Button size="sm" type="button" variant="secondary" onClick={() => runUserAction(() => store.load())}>
              {t("Common.actions.refresh")}
            </Button>
          }
          className="min-h-40"
          description={t("Pipelines.loadErrorDescription")}
          state="error"
          title={t("Pipelines.loadErrorTitle")}
        />
      );
      break;
    case "empty":
      body = (
        <PageState
          background={
            <SettingsFormSkeleton className="gap-3">
              <SettingsFieldSkeleton short animated={false} />
            </SettingsFormSkeleton>
          }
          className="min-h-40"
          description={t("Pipelines.emptyDescription")}
          icon={Workflow}
          state="empty"
          title={t("Pipelines.emptyTitle")}
        />
      );
      break;
    case "content":
      body = (
        <DndContext sensors={sensors} onDragEnd={(event) => runUserAction(() => reorder(event))}>
          <SortableContext
            items={visiblePipelines.map((pipeline) => pipeline.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-col gap-2">
              {visiblePipelines.map((pipeline) => (
                <SortablePipelineRow
                  key={pipeline.id}
                  isDisabled={isDisabled}
                  isSelected={pipeline.id === store.selectedPipelineId}
                  pipeline={pipeline}
                  onDelete={() => confirmPipelineDelete(pipeline)}
                  onRename={(name) => runUserAction(() => store.renamePipeline(pipeline.id, name))}
                  onSelect={() => store.selectPipeline(pipeline.id)}
                  onSetDefault={() => runUserAction(() => store.setPipelineDefault(pipeline.id))}
                  onToggleArchived={() =>
                    runUserAction(() =>
                      pipeline.archivedAt === null
                        ? store.archivePipeline(pipeline.id)
                        : store.unarchivePipeline(pipeline.id),
                    )
                  }
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      );
      break;
    default: {
      const exhaustive: never = state;
      body = exhaustive;
    }
  }

  return (
    <section data-company-pipelines className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-sm font-medium">{t("Pipelines.title")}</h2>

        <p className="text-subdued text-xs">{t("Pipelines.description", { deals })}</p>
      </div>

      {body}

      {hasArchived && (
        <div>
          <Button size="xs" type="button" variant="ghost" onClick={() => setIsShowingArchived((previous) => !previous)}>
            {isShowingArchived ? t("Pipelines.hideArchived") : t("Pipelines.showArchived")}
          </Button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Input
          aria-label={t("Pipelines.newPipelineName")}
          className="h-9 min-w-0 flex-1"
          disabled={isDisabled}
          placeholder={t("Pipelines.newPipelineName")}
          value={newPipelineName}
          onChange={(event) => setNewPipelineName(event.target.value)}
        />

        <Button
          disabled={isDisabled || newPipelineName.trim() === ""}
          size="sm"
          type="button"
          variant="secondary"
          onClick={() => runUserAction(() => createPipeline())}
        >
          <Icon className="size-4" icon={Plus} />

          {t("Pipelines.createPipeline")}
        </Button>
      </div>

      {state === "content" && <PipelineStagesList />}

      <DeleteStageModal />
    </section>
  );
});
