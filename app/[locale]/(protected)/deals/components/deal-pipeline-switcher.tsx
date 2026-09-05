"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Workflow } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRootStore } from "@/core/stores/root-store.provider";

export const ALL_PIPELINES_VALUE = "all";

export const DealPipelineSwitcher = observer(function DealPipelineSwitcher() {
  const t = useTranslations();
  const { dealsStore, editFiltersModalStore } = useRootStore();

  if (!dealsStore.isReady) return null;
  if (dealsStore.pipelines.length < 2) return null;

  const options = dealsStore.pipelines.filter(
    (pipeline) => !pipeline.isArchived || pipeline.id === dealsStore.selectedPipelineId,
  );

  return (
    <Select
      value={dealsStore.selectedPipelineId ?? ALL_PIPELINES_VALUE}
      onValueChange={(next) => {
        dealsStore.selectPipeline(next === ALL_PIPELINES_VALUE ? null : next);
        editFiltersModalStore.syncDraftFromTable(dealsStore);
      }}
    >
      <SelectTrigger aria-label={t("DealModal.pipeline.switcherLabel")} className="min-w-36 gap-1.5" size="sm">
        <Workflow className="size-3.5" />

        <SelectValue />
      </SelectTrigger>

      <SelectContent>
        <SelectItem value={ALL_PIPELINES_VALUE}>{t("DealModal.pipeline.allPipelines")}</SelectItem>

        {options.map((pipeline) => (
          <SelectItem key={pipeline.id} value={pipeline.id}>
            {pipeline.isArchived ? t("DealModal.pipeline.archivedOption", { name: pipeline.name }) : pipeline.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
});
