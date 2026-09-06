"use client";

import type { ActivityCounts } from "@/features/tasks/get/get-activity-counts.interactor";

import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlarmClock, CalendarClock } from "lucide-react";
import { Resource } from "@/generated/prisma";

import { getActivityCountsAction } from "../../tasks/actions";

import { Icon } from "@/components/shared/icon";
import { AppLink } from "@/components/shared/app-link";
import { Card } from "@/components/ui/card";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { cn } from "@/core/utils/cn";

function endOfLocalDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
}

export const ActivitySummaryCards = observer(function ActivitySummaryCards() {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { userStore } = useRootStore();
  const [counts, setCounts] = useState<ActivityCounts | null>(null);

  const canAccessTasks = userStore.canAccess(Resource.tasks);

  useEffect(() => {
    if (!canAccessTasks) return;

    let active = true;

    getActivityCountsAction({ dayEndsAt: endOfLocalDay(new Date()) })
      .then((result) => {
        if (active) setCounts(result);
      })
      .catch(reportApplicationError);

    return () => {
      active = false;
    };
  }, [canAccessTasks]);

  if (!canAccessTasks || !counts) return null;

  const tiles = [
    {
      key: "overdue",
      icon: AlarmClock,
      label: t("Activities.summary.overdue"),
      value: counts.overdue,
      emphasis: counts.overdue > 0,
    },
    {
      key: "dueToday",
      icon: CalendarClock,
      label: t("Activities.summary.dueToday"),
      value: counts.dueToday,
      emphasis: false,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {tiles.map((tile) => (
        <Card key={tile.key} className="p-0">
          <AppLink
            appearance="unstyled"
            className="interactive-surface flex items-center gap-3 rounded-xl px-4 py-3"
            href="/tasks"
          >
            <Icon
              className={cn(tile.emphasis ? "text-destructive" : "text-muted-foreground")}
              icon={tile.icon}
              size="lg"
            />

            <span className="flex min-w-0 flex-col">
              <span
                suppressHydrationWarning
                className={cn("text-2xl font-semibold tabular-nums", tile.emphasis && "text-destructive")}
              >
                {intlStore.formatNumber(tile.value)}
              </span>

              <span className="truncate text-xs text-muted-foreground">{tile.label}</span>
            </span>
          </AppLink>
        </Card>
      ))}
    </div>
  );
});
