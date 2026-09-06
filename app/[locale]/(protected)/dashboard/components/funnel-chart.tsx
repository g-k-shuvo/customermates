"use client";

import type { FunnelStagePoint } from "@/features/widget/widget.schema";

import { ChevronDown } from "lucide-react";

import { Icon } from "@/components/shared/icon";

import { funnelBarWidthPercent, widestStageCount } from "./funnel-widget-state";
import { useFunnelCopy } from "./use-funnel-copy";

type Props = {
  stages: FunnelStagePoint[];
};

export function FunnelChart({ stages }: Props) {
  const { advancedLabel, conversionLabel, enteredLabel } = useFunnelCopy();
  const widest = widestStageCount(stages);

  return (
    <ol className="flex min-w-0 flex-col gap-1">
      {stages.map((stage, index) => (
        <li key={stage.stageId} className="min-w-0">
          <div className="flex min-w-0 items-baseline justify-between gap-2">
            <span className="min-w-0 truncate text-xs font-medium text-foreground">{stage.label}</span>

            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{enteredLabel(stage)}</span>
          </div>

          <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${funnelBarWidthPercent(stage.enteredCount, widest)}%` }}
            />
          </div>

          {index < stages.length - 1 && (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Icon aria-hidden className="shrink-0 opacity-60" icon={ChevronDown} size="sm" />

              <span className="min-w-0 truncate">{conversionLabel(stage)}</span>

              <span aria-hidden className="opacity-40">
                ·
              </span>

              <span className="shrink-0 tabular-nums">{advancedLabel(stage)}</span>
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
