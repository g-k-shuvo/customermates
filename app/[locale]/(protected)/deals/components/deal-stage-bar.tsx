"use client";

import type { DealStageDurationDto, DealStageDurationsDto } from "@/features/deals/deal-stage-durations.schema";

import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { useRootStore } from "@/core/stores/root-store.provider";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { cn } from "@/core/utils/cn";

import { getDealStageDurationsAction } from "../actions";

const MINUTE_SECONDS = 60;
const HOUR_SECONDS = 60 * MINUTE_SECONDS;
const DAY_SECONDS = 24 * HOUR_SECONDS;

export const DealStageBar = observer(function DealStageBar() {
  const t = useTranslations();
  const { dealDetailStore } = useRootStore();
  const deal = dealDetailStore.fetchedEntity;
  const dealId = deal?.id;
  const stageId = deal?.stageId ?? null;
  const updatedAt = deal?.updatedAt?.valueOf() ?? null;
  const [durations, setDurations] = useState<DealStageDurationsDto | null>(null);

  useEffect(() => {
    if (!dealId) {
      setDurations(null);
      return;
    }

    let active = true;
    void getDealStageDurationsAction({ id: dealId })
      .then((result) => {
        if (active) setDurations(result.ok ? result.data : null);
      })
      .catch(reportApplicationError);

    return () => {
      active = false;
    };
  }, [dealId, stageId, updatedAt]);

  if (!durations || durations.stages.length === 0) return null;

  const formatDuration = (stage: DealStageDurationDto) => {
    if (stage.visits === 0) return t("DealModal.stageBar.notEntered");
    if (stage.durationSeconds >= DAY_SECONDS)
      return t("DealModal.stageBar.days", { count: Math.floor(stage.durationSeconds / DAY_SECONDS) });
    if (stage.durationSeconds >= HOUR_SECONDS)
      return t("DealModal.stageBar.hours", { count: Math.floor(stage.durationSeconds / HOUR_SECONDS) });
    if (stage.durationSeconds >= MINUTE_SECONDS)
      return t("DealModal.stageBar.minutes", { count: Math.floor(stage.durationSeconds / MINUTE_SECONDS) });

    return t("DealModal.stageBar.lessThanMinute");
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{t("DealModal.stageBar.label")}</span>

      <ol
        aria-label={t("DealModal.stageBar.label")}
        className="grid grid-cols-2 gap-1 sm:grid-flow-col sm:auto-cols-fr sm:grid-cols-none"
      >
        {durations.stages.map((stage) => {
          const duration = formatDuration(stage);
          const description = stage.isCurrent
            ? t("DealModal.stageBar.currentStage", { name: stage.name, duration })
            : t("DealModal.stageBar.stage", { name: stage.name, duration });

          return (
            <li
              key={stage.stageId}
              aria-current={stage.isCurrent ? "step" : undefined}
              aria-label={description}
              className={cn(
                "min-w-0 rounded-md px-2 py-1.5 text-xs",
                stage.isCurrent && "bg-primary text-primary-foreground",
                !stage.isCurrent && stage.visits > 0 && "bg-muted text-foreground",
                !stage.isCurrent && stage.visits === 0 && "bg-muted/40 text-muted-foreground",
              )}
              title={description}
            >
              <span className="block truncate font-medium">{stage.name}</span>

              <span className="block truncate">{duration}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
});
