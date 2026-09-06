"use client";

import type { FunnelStagePoint, FunnelSummary } from "@/features/widget/widget.schema";

import { useTranslations } from "next-intl";
import { EntityType } from "@/generated/prisma";

import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";

export type FunnelCopy = {
  enteredLabel: (stage: FunnelStagePoint) => string;
  advancedLabel: (stage: FunnelStagePoint) => string;
  conversionLabel: (stage: FunnelStagePoint) => string;
  summaryLabel: (summary: FunnelSummary | null) => string | null;
  periodLabel: (days: number) => string;
};

export function useFunnelCopy(): FunnelCopy {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { plural } = useEntityTerminology();

  const formatCount = (value: number) => intlStore.formatNumber(value);
  const formatPercent = (value: number) => intlStore.formatNumber(value, { maximumFractionDigits: 1 });

  return {
    enteredLabel: (stage) => t("Dashboard.funnelWidget.entered", { count: formatCount(stage.enteredCount) }),

    advancedLabel: (stage) => t("Dashboard.funnelWidget.advanced", { count: formatCount(stage.advancedCount) }),

    conversionLabel: (stage) => {
      if (stage.nextStageLabel === null || stage.conversionToNextPercent === null)
        return t("Dashboard.funnelWidget.noConversion");

      return t("Dashboard.funnelWidget.conversionToNext", {
        stage: stage.nextStageLabel,
        value: formatPercent(stage.conversionToNextPercent),
      });
    },

    summaryLabel: (summary) => {
      if (!summary) return null;

      const entered = t("Dashboard.funnelWidget.dealsEntered", {
        count: formatCount(summary.dealsEntered),
        deals: plural(EntityType.deal),
      });

      if (summary.openToWonPercent === null) return entered;

      return `${entered} · ${t("Dashboard.funnelWidget.openToWon", {
        value: formatPercent(summary.openToWonPercent),
      })}`;
    },

    periodLabel: (days) => t("Dashboard.periods.lastDays", { days }),
  };
}
