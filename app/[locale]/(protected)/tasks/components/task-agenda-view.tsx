"use client";

import type { TaskDto } from "@/features/tasks/task.schema";
import type { AgendaBucket } from "@/features/tasks/activity-agenda";

import { observer } from "mobx-react-lite";
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { CalendarCheck } from "lucide-react";
import { EntityType, TaskType } from "@/generated/prisma";

import { ActivityDueBadge } from "@/components/activity/activity-due-badge";
import { ActivityKindIcon } from "@/components/activity/activity-kind-icon";
import { AppChipStack } from "@/components/chip/app-chip-stack";
import { useEntityHref } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { PageState } from "@/components/page-state/page-state";
import { AppLink } from "@/components/shared/app-link";
import { groupAgenda } from "@/features/tasks/activity-agenda";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";

import { ActivityCompleteToggle } from "./activity-complete-toggle";
import { getSystemTaskNameTranslationKey } from "./system-task.config";
import { TasksPageSkeleton } from "./tasks-page-skeleton";

const BUCKET_LABEL_KEY: Record<AgendaBucket, string> = {
  overdue: "Activities.agenda.overdue",
  today: "Activities.agenda.today",
  tomorrow: "Activities.agenda.tomorrow",
  thisWeek: "Activities.agenda.thisWeek",
  later: "Activities.agenda.later",
  undated: "Activities.agenda.undated",
};

const AgendaRow = observer(function AgendaRow({ activity }: { activity: TaskDto }) {
  const t = useTranslations();
  const entityHref = useEntityHref();

  const nameKey = getSystemTaskNameTranslationKey(activity.type);
  const displayName = nameKey ? t(nameKey) : activity.name;
  const isCompleted = activity.completedAt !== null;
  const linkedCount = activity.contacts.length + activity.organizations.length + activity.deals.length;

  return (
    <li className="flex items-center gap-3 rounded-lg border border-border/60 bg-card px-3 py-2">
      <ActivityKindIcon className="shrink-0 text-muted-foreground" kind={activity.activityKind} />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <AppLink
          className={cn("truncate text-sm font-medium", isCompleted && "text-muted-foreground line-through")}
          href={entityHref(EntityType.task, activity.id)}
        >
          {displayName}
        </AppLink>

        {activity.deals.length > 0 && (
          <AppChipStack
            chipHref={(deal) => entityHref(EntityType.deal, deal.id)}
            items={activity.deals.map((deal) => ({ id: deal.id, label: deal.name }))}
            size="sm"
          />
        )}
      </div>

      <ActivityDueBadge
        activityKind={activity.activityKind}
        dueAt={activity.dueAt}
        isCompleted={isCompleted}
        isOverdue={activity.isOverdue}
      />

      {activity.type === TaskType.custom && (
        <ActivityCompleteToggle
          activity={{
            id: activity.id,
            name: activity.name,
            activityKind: activity.activityKind,
            dueAt: activity.dueAt,
            completedAt: activity.completedAt,
            hasLinkedRecords: linkedCount > 0,
          }}
        />
      )}
    </li>
  );
});

export const TaskAgendaView = observer(function TaskAgendaView() {
  const t = useTranslations();
  const { plural } = useEntityTerminology();
  const { tasksStore } = useRootStore();

  const items = tasksStore.items;
  const groups = useMemo(() => groupAgenda(items, new Date()), [items]);

  if (groups.length === 0) {
    return (
      <PageState
        background={<TasksPageSkeleton animated={false} view="board" />}
        description={t("Activities.agenda.emptyBody", { plural: plural(EntityType.task) })}
        icon={CalendarCheck}
        state="empty"
        title={t("Activities.agenda.emptyTitle")}
      />
    );
  }

  return (
    <div className="animate-page-result-in h-full overflow-y-auto p-4 motion-reduce:animate-none" data-slot="card-grid">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {groups.map((group) => (
          <section key={group.bucket} className="flex flex-col gap-2">
            <h2
              className={cn(
                "text-xs font-semibold tracking-wide uppercase",
                group.bucket === "overdue" ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {t(BUCKET_LABEL_KEY[group.bucket], { count: group.items.length })}
            </h2>

            <ul className="flex flex-col gap-2">
              {group.items.map((activity) => (
                <AgendaRow key={activity.id} activity={activity} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
});
