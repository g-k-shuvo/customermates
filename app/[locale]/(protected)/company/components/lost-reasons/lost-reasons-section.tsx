"use client";

import type { ReactNode } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import type { LostReasonDto } from "@/features/lost-reasons/lost-reason.schema";

import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useLocale, useTranslations } from "next-intl";
import { AlignJustify, CircleSlash, Plus, Trash2 } from "lucide-react";
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

export type LostReasonsSectionState = "loading" | "error" | "empty" | "content";

type LostReasonsSectionStateArgs = {
  isLoading: boolean;
  hasLoadError: boolean;
  hasLostReasons: boolean;
};

export function resolveLostReasonsSectionState({
  isLoading,
  hasLoadError,
  hasLostReasons,
}: LostReasonsSectionStateArgs): LostReasonsSectionState {
  if (hasLoadError) return "error";
  if (isLoading) return "loading";

  return hasLostReasons ? "content" : "empty";
}

type LostReasonRowProps = {
  lostReason: LostReasonDto;
  isDisabled: boolean;
  onRename: (name: string) => void;
  onToggleArchived: () => void;
  onDelete: () => void;
};

const SortableLostReasonRow = observer(
  ({ lostReason, isDisabled, onRename, onToggleArchived, onDelete }: LostReasonRowProps) => {
    const t = useTranslations();
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
      id: lostReason.id,
      disabled: isDisabled,
    });
    const [draftName, setDraftName] = useState(lostReason.name);

    useEffect(() => {
      setDraftName(lostReason.name);
    }, [lostReason.name]);

    function commitName() {
      const next = draftName.trim();
      if (next === "" || next === lostReason.name) {
        setDraftName(lostReason.name);
        return;
      }

      onRename(next);
    }

    return (
      <li
        ref={setNodeRef}
        className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2"
        style={{ transform: CSS.Transform.toString(transform), transition }}
      >
        <span
          aria-label={t("LostReasons.reorderLostReasonLabel", { name: lostReason.name })}
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
          aria-label={t("LostReasons.lostReasonNameLabel", { name: lostReason.name })}
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

        {lostReason.archivedAt !== null && <AppChip variant="warning">{t("LostReasons.archivedBadge")}</AppChip>}

        <Button disabled={isDisabled} size="xs" type="button" variant="ghost" onClick={onToggleArchived}>
          {lostReason.archivedAt === null ? t("LostReasons.archive") : t("LostReasons.unarchive")}
        </Button>

        <Button
          aria-label={t("LostReasons.deleteLostReasonLabel", { name: lostReason.name })}
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

export const LostReasonsSection = observer(() => {
  const locale = useLocale();
  const t = useTranslations();
  const { lostReasonsStore: store, deleteConfirmationModalStore } = useRootStore();
  const { plural } = useEntityTerminology();
  const { showDeleteConfirmation } = useDeleteConfirmation();
  const deals = terminologyLabelForSentence(plural(EntityType.deal), locale);
  const [newLostReasonName, setNewLostReasonName] = useState("");
  const [isShowingArchived, setIsShowingArchived] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    void store.load().catch(reportApplicationError);
  }, [store]);

  const visibleLostReasons = isShowingArchived ? store.sortedLostReasons : store.activeLostReasons;
  const hasArchived = store.sortedLostReasons.length > store.activeLostReasons.length;
  const isDisabled = store.isSaving || !store.canManage;

  const state = resolveLostReasonsSectionState({
    isLoading: store.isLoading,
    hasLoadError: store.hasLoadError,
    hasLostReasons: store.sortedLostReasons.length > 0,
  });

  async function reorder(event: DragEndEvent): Promise<void> {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const ids = store.sortedLostReasons.map((lostReason) => lostReason.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;

    await store.reorderLostReasons(arrayMove(ids, from, to));
  }

  async function createLostReason(): Promise<void> {
    const name = newLostReasonName.trim();
    if (name === "") return;

    const created = await store.createLostReason({ name });
    if (created) setNewLostReasonName("");
  }

  function confirmLostReasonDelete(lostReason: LostReasonDto): void {
    showDeleteConfirmation(async () => {
      const deleted = await store.deleteLostReason(lostReason.id);
      if (!deleted) deleteConfirmationModalStore.close();

      return deleted;
    }, lostReason.name);
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
          description={t("LostReasons.loadErrorDescription")}
          state="error"
          title={t("LostReasons.loadErrorTitle")}
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
          description={t("LostReasons.emptyDescription", { deals })}
          icon={CircleSlash}
          state="empty"
          title={t("LostReasons.emptyTitle")}
        />
      );
      break;
    case "content":
      body = (
        <DndContext sensors={sensors} onDragEnd={(event) => runUserAction(() => reorder(event))}>
          <SortableContext
            items={visibleLostReasons.map((lostReason) => lostReason.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-col gap-2">
              {visibleLostReasons.map((lostReason) => (
                <SortableLostReasonRow
                  key={lostReason.id}
                  isDisabled={isDisabled}
                  lostReason={lostReason}
                  onDelete={() => confirmLostReasonDelete(lostReason)}
                  onRename={(name) => runUserAction(() => store.renameLostReason(lostReason.id, name))}
                  onToggleArchived={() =>
                    runUserAction(() =>
                      lostReason.archivedAt === null
                        ? store.archiveLostReason(lostReason.id)
                        : store.unarchiveLostReason(lostReason.id),
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
    <section data-company-lost-reasons className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-sm font-medium">{t("LostReasons.title")}</h2>

        <p className="text-subdued text-xs">{t("LostReasons.description", { deals })}</p>
      </div>

      {body}

      {hasArchived && (
        <div>
          <Button size="xs" type="button" variant="ghost" onClick={() => setIsShowingArchived((previous) => !previous)}>
            {isShowingArchived ? t("LostReasons.hideArchived") : t("LostReasons.showArchived")}
          </Button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Input
          aria-label={t("LostReasons.newLostReasonName")}
          className="h-9 min-w-0 flex-1"
          disabled={isDisabled}
          placeholder={t("LostReasons.newLostReasonName")}
          value={newLostReasonName}
          onChange={(event) => setNewLostReasonName(event.target.value)}
        />

        <Button
          disabled={isDisabled || newLostReasonName.trim() === ""}
          size="sm"
          type="button"
          variant="secondary"
          onClick={() => runUserAction(() => createLostReason())}
        >
          <Icon className="size-4" icon={Plus} />

          {t("LostReasons.createLostReason")}
        </Button>
      </div>
    </section>
  );
});
