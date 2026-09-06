"use client";

import type { ChartWidgetDto } from "@/features/widget/widget.schema";
import type { Filter } from "@/core/base/base-get.schema";

import { Fragment } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { EntityType } from "@/generated/prisma";

import { useRootStore } from "@/core/stores/root-store.provider";
import { useWidgetMetricCopy } from "./use-widget-metric-copy";
import { widgetHeadlineValue, widgetMetricNote } from "./widget-metric-note";
import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppCardBody } from "@/components/card/app-card-body";
import { hasValidFilterConfiguration } from "@/components/data-view/table-view.utils";
import { useFilterFieldLabel } from "@/components/entity-terminology/use-filter-field-label";
import { supportsDealFilters } from "@/features/widget/widget.schema";
import { widgetSubheader } from "./widget-subheader";
import { WidgetChart } from "./widget-chart";
import { WidgetFilterChip } from "./widget-filter-chip";

type Props = {
  widget: ChartWidgetDto;
};

export const ChartWidgetCard = observer(({ widget }: Props) => {
  const t = useTranslations();
  const filterFieldLabel = useFilterFieldLabel();
  const { widgetModalStore, widgetsStore } = useRootStore();
  const { formatHeadline, noteText, periodText } = useWidgetMetricCopy();
  const customColumns = widgetsStore.customColumns;
  const dealCustomColumns = customColumns.filter((c) => c.entityType === EntityType.deal);
  const entityCustomColumns = customColumns.filter((c) => c.entityType === widget.entityType);

  const activeEntityFilters: Filter[] = (widget.entityFilters ?? []).filter(hasValidFilterConfiguration);
  const activeDealFilters: Filter[] = supportsDealFilters(widget)
    ? widget.dealFilters.filter(hasValidFilterConfiguration)
    : [];

  const data = widget.data ?? [];
  const summedValue = data.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
  const formattedTotal = formatHeadline(
    widget.aggregationType,
    widgetHeadlineValue(widget.aggregationType, widget.dataSummary, summedValue),
  );
  const subheaderNotes = [
    periodText(widget.aggregationType, widget.periodDays),
    noteText(widgetMetricNote(widget.aggregationType, widget.dataSummary)),
  ].filter((note): note is string => Boolean(note));
  const subheader = widgetSubheader(
    data.length,
    formattedTotal,
    t("Diagrams.groups"),
    subheaderNotes.length > 0 ? subheaderNotes.join(" · ") : null,
  );

  const cardContent =
    widget.data.length === 0 ? (
      <div className="flex size-full flex-col items-center justify-center space-y-3 text-center">
        {t("Diagrams.noData")}
      </div>
    ) : (
      <WidgetChart aggregationType={widget.aggregationType} data={widget.data} displayOptions={widget.displayOptions} />
    );

  const showFilters = widget.displayOptions?.showFilters !== false;

  const inlineFilters: Array<{
    key: string;
    label: string;
    customColumns: typeof entityCustomColumns;
    filter: Filter;
    onClick: () => Promise<void>;
  }> = showFilters
    ? [
        ...activeEntityFilters.map((filter, index) => ({
          key: `entity-${filter.field}-${index}`,
          label: filterFieldLabel(filter.field, entityCustomColumns),
          customColumns: entityCustomColumns,
          filter,
          onClick: () => widgetModalStore.openWithFilter(widget.id, "filters", filter.field),
        })),
        ...activeDealFilters.map((filter, index) => ({
          key: `deal-${filter.field}-${index}`,
          label: filterFieldLabel(filter.field, dealCustomColumns),
          customColumns: dealCustomColumns,
          filter,
          onClick: () => widgetModalStore.openWithFilter(widget.id, "dealFilters", filter.field),
        })),
      ]
    : [];

  const showSubheaderRow = subheader || inlineFilters.length > 0;

  return (
    <AppCard className="h-full cursor-pointer overflow-visible">
      <AppCardHeader className="flex-col items-start gap-0.5">
        <h2 className="text-x-md w-full truncate">{widget.name}</h2>

        {showSubheaderRow && (
          <p className="text-xs text-muted-foreground w-full line-clamp-2 wrap-break-word">
            {subheader}

            {inlineFilters.map((f) => (
              <Fragment key={f.key}>
                <span aria-hidden className="mx-1 opacity-40">
                  ·
                </span>

                <WidgetFilterChip
                  customColumns={f.customColumns}
                  filter={f.filter}
                  label={f.label}
                  onOpen={f.onClick}
                />
              </Fragment>
            ))}
          </p>
        )}
      </AppCardHeader>

      <AppCardBody className="overflow-visible recharts-no-focus-outline">{cardContent}</AppCardBody>
    </AppCard>
  );
});
