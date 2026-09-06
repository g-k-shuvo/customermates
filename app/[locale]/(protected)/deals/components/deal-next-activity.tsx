"use client";

import type { DealActivityReference } from "@/features/deals/deal.schema";

import { observer } from "mobx-react-lite";
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { CalendarOff } from "lucide-react";
import { DealStatus } from "@/generated/prisma";

import { ActivityDueBadge } from "@/components/activity/activity-due-badge";
import { AppChip } from "@/components/chip/app-chip";
import { nextActivityOf } from "@/features/tasks/task-next-activity";

type Props = {
  activities: DealActivityReference[];
  status: DealStatus;
  showName?: boolean;
};

export const DealNextActivity = observer(function DealNextActivity({ activities, status, showName = false }: Props) {
  const t = useTranslations();
  const nextActivity = useMemo(() => nextActivityOf(activities, new Date()), [activities]);

  if (!nextActivity) {
    if (status !== DealStatus.open) return null;

    return (
      <AppChip startContent={<CalendarOff aria-hidden="true" className="size-3 opacity-70" />} variant="warning">
        {t("Activities.nextActivity.none")}
      </AppChip>
    );
  }

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <ActivityDueBadge
        activityKind={nextActivity.activityKind}
        dueAt={nextActivity.dueAt}
        isOverdue={nextActivity.isOverdue}
      />

      {showName && <span className="truncate text-xs text-muted-foreground">{nextActivity.name}</span>}
    </span>
  );
});
