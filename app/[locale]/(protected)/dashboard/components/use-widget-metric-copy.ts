"use client";

import type { WidgetMetricNote } from "./widget-metric-note";

import { useTranslations } from "next-intl";
import type { AggregationType } from "@/generated/prisma";
import { EntityType } from "@/generated/prisma";

import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import {
  isCurrencyAggregation,
  isDurationAggregation,
  isPeriodAggregation,
  isRateAggregation,
  resolvePeriodDays,
} from "@/features/widget/widget-aggregation";

export type WidgetMetricCopy = {
  formatHeadline: (aggregationType: AggregationType, value: number) => string;
  noteText: (note: WidgetMetricNote) => string | null;
  periodText: (aggregationType: AggregationType, periodDays: number | null) => string | null;
};

export function useWidgetMetricCopy(): WidgetMetricCopy {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { plural } = useEntityTerminology();

  const formatDays = (value: number) =>
    t("Dashboard.widgetMetrics.days", { value: intlStore.formatNumber(value, { maximumFractionDigits: 1 }) });

  return {
    formatHeadline: (aggregationType, value) => {
      if (isCurrencyAggregation(aggregationType))
        return intlStore.formatCurrency(value, undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

      if (isRateAggregation(aggregationType)) {
        return t("Dashboard.widgetMetrics.percent", {
          value: intlStore.formatNumber(value, { maximumFractionDigits: 1 }),
        });
      }

      if (isDurationAggregation(aggregationType)) return formatDays(value);

      return intlStore.formatNumber(value);
    },

    periodText: (aggregationType, periodDays) => {
      if (!isPeriodAggregation(aggregationType)) return null;

      return t("Dashboard.periods.lastDays", { days: resolvePeriodDays(aggregationType, periodDays) });
    },

    noteText: (note) => {
      if (!note) return null;

      if (note.kind === "winRateDenominator") {
        return t("Dashboard.widgetMetrics.winRateDenominator", {
          closed: intlStore.formatNumber(note.sampleSize),
          deals: plural(EntityType.deal),
        });
      }

      if (note.median === null) return null;

      return t("Dashboard.widgetMetrics.median", {
        value: intlStore.formatNumber(note.median, { maximumFractionDigits: 1 }),
      });
    },
  };
}
