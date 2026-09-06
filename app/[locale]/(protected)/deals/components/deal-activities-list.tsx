"use client";

import type { DealActivityReference } from "@/features/deals/deal.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { EntityType, TaskType } from "@/generated/prisma";

import { ActivityDueBadge } from "@/components/activity/activity-due-badge";
import { ActivityKindIcon } from "@/components/activity/activity-kind-icon";
import { EntityDetailField } from "@/components/entity-detail/entity-detail-field";
import { EntityDetailFieldActions } from "@/components/entity-detail/entity-detail-field-actions";
import { useEntityHref } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { FormOutputField } from "@/components/forms/form-output-field";
import { AppLink } from "@/components/shared/app-link";
import { compareByDueDate } from "@/features/tasks/activity-agenda";
import { isOverdue } from "@/features/tasks/task-overdue";
import { cn } from "@/core/utils/cn";

import { ActivityCompleteToggle } from "../../tasks/components/activity-complete-toggle";
import { getSystemTaskNameTranslationKey } from "../../tasks/components/system-task.config";
import { DEAL_DETAIL_FIELD } from "./deal-detail-personalization";

type Props = {
  activities: DealActivityReference[] | undefined;
  showFieldActions?: boolean;
};

export const DealActivitiesList = observer(function DealActivitiesList({
  activities,
  showFieldActions = false,
}: Props) {
  const t = useTranslations();
  const entityHref = useEntityHref();

  const label = t("Activities.list.label");
  const items = [...(activities ?? [])].sort(compareByDueDate);
  const now = new Date();

  return (
    <EntityDetailField fieldId={DEAL_DETAIL_FIELD.activities}>
      <FormOutputField
        label={label}
        labelEndAddon={
          showFieldActions ? <EntityDetailFieldActions fieldId={DEAL_DETAIL_FIELD.activities} label={label} /> : null
        }
        outputClassName="h-auto min-h-9 py-1.5"
      >
        {items.length === 0 ? (
          <span className="text-sm text-muted-foreground">{t("Activities.list.empty")}</span>
        ) : (
          <ul className="flex w-full flex-col gap-1.5">
            {items.map((activity) => {
              const nameKey = getSystemTaskNameTranslationKey(activity.type);
              const isCompleted = activity.completedAt !== null;

              return (
                <li key={activity.id} className="flex items-center gap-2">
                  <ActivityKindIcon className="shrink-0 text-muted-foreground" kind={activity.activityKind} size="sm" />

                  <AppLink
                    className={cn(
                      "min-w-0 flex-1 truncate text-sm",
                      isCompleted && "text-muted-foreground line-through",
                    )}
                    href={entityHref(EntityType.task, activity.id)}
                  >
                    {nameKey ? t(nameKey) : activity.name}
                  </AppLink>

                  <ActivityDueBadge
                    activityKind={activity.activityKind}
                    dueAt={activity.dueAt}
                    isCompleted={isCompleted}
                    isOverdue={isOverdue(activity.dueAt, activity.completedAt, now)}
                  />

                  {activity.type === TaskType.custom && (
                    <ActivityCompleteToggle
                      activity={{
                        id: activity.id,
                        name: activity.name,
                        activityKind: activity.activityKind,
                        dueAt: activity.dueAt,
                        completedAt: activity.completedAt,
                        hasLinkedRecords: true,
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </FormOutputField>
    </EntityDetailField>
  );
});
