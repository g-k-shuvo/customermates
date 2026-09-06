"use client";

import type { FunnelWidgetDto } from "@/features/widget/widget.schema";
import type { ReactNode } from "react";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { EntityType } from "@/generated/prisma";

import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppCardBody } from "@/components/card/app-card-body";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { resolveFunnelPeriodDays } from "@/features/widget/widget-aggregation";

import { FunnelChart } from "./funnel-chart";
import { resolveFunnelWidgetState } from "./funnel-widget-state";
import { useFunnelCopy } from "./use-funnel-copy";

type Props = {
  widget: FunnelWidgetDto;
};

export const FunnelWidgetCard = observer(({ widget }: Props) => {
  const t = useTranslations();
  const { plural } = useEntityTerminology();
  const { periodLabel, summaryLabel } = useFunnelCopy();
  const state = resolveFunnelWidgetState(widget);
  const showSummary = widget.displayOptions?.showFilters !== false;
  const periodDays = resolveFunnelPeriodDays(widget.periodDays);
  const summary = summaryLabel(widget.summary);
  const subheader = [widget.pipelineName, periodLabel(periodDays), summary].filter(Boolean).join(" · ");

  let body: ReactNode;
  switch (state) {
    case "noPipeline":
      body = <FunnelNotice label={t("Dashboard.funnelWidget.noPipeline")} />;
      break;
    case "noStages":
      body = <FunnelNotice label={t("Dashboard.funnelWidget.noStages")} />;
      break;
    case "noData":
      body = (
        <FunnelNotice
          label={t("Dashboard.funnelWidget.noData", { days: periodDays, deals: plural(EntityType.deal) })}
        />
      );
      break;
    case "content":
      body = <FunnelChart stages={widget.stages} />;
      break;
    default: {
      const exhaustive: never = state;
      body = exhaustive;
    }
  }

  return (
    <AppCard className="h-full cursor-pointer overflow-hidden">
      <AppCardHeader className="flex-col items-start gap-0.5">
        <h2 className="text-x-md w-full truncate">{widget.name}</h2>

        {showSummary && (
          <>
            <p className="text-xs text-muted-foreground w-full line-clamp-2 wrap-break-word">{subheader}</p>

            <p className="text-xs text-muted-foreground/80 w-full line-clamp-2 wrap-break-word">
              {t("Dashboard.funnelWidget.definition", { deals: plural(EntityType.deal) })}
            </p>
          </>
        )}
      </AppCardHeader>

      <AppCardBody className="min-h-0 flex-1 overflow-auto">{body}</AppCardBody>
    </AppCard>
  );
});

function FunnelNotice({ label }: { label: string }) {
  return (
    <div className="text-muted-foreground flex h-full items-center justify-center px-4 py-6 text-center text-sm">
      {label}
    </div>
  );
}
