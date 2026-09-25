"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { CalendarOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";

import {
  NEXT_ACTIVITY_FILTER_FIELD,
  isNoNextActivityFilterActive,
  toggleNoNextActivityFilter,
} from "./deal-board-filters";

export const DealNextActivityFilterChip = observer(function DealNextActivityFilterChip() {
  const t = useTranslations();
  const { dealsStore } = useRootStore();

  if (!dealsStore.isReady) return null;
  if (!dealsStore.filterableFields.some((field) => field.field === NEXT_ACTIVITY_FILTER_FIELD)) return null;

  const isActive = isNoNextActivityFilterActive(dealsStore.filters);

  return (
    <Button
      aria-pressed={isActive}
      className="h-8"
      size="sm"
      type="button"
      variant={isActive ? "default" : "secondary"}
      onClick={() => {
        dealsStore.setQueryOptions({ filters: toggleNoNextActivityFilter(dealsStore.filters) });
      }}
    >
      <CalendarOff className="size-3.5" />

      <span className="hidden sm:inline">{t("Common.filters.nextActivityValues.none")}</span>
    </Button>
  );
});
