"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Hourglass } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";

import { ROTTING_FILTER_FIELD, isRottingFilterActive, toggleRottingDealsFilter } from "./deal-board-filters";

export const DealRottingFilterChip = observer(function DealRottingFilterChip() {
  const t = useTranslations();
  const { dealsStore, editFiltersModalStore } = useRootStore();

  if (!dealsStore.isReady) return null;
  if (!dealsStore.filterableFields.some((field) => field.field === ROTTING_FILTER_FIELD)) return null;

  const isActive = isRottingFilterActive(dealsStore.filters);

  return (
    <Button
      aria-pressed={isActive}
      className="h-8"
      size="sm"
      type="button"
      variant={isActive ? "default" : "secondary"}
      onClick={() => {
        dealsStore.setQueryOptions({ filters: toggleRottingDealsFilter(dealsStore.filters) });
        editFiltersModalStore.syncDraftFromTable(dealsStore);
      }}
    >
      <Hourglass className="size-3.5" />

      <span className="hidden sm:inline">{t("Common.filters.fields.rotting")}</span>
    </Button>
  );
});
