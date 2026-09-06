"use client";

import type { ActivityCompletionTarget } from "./activity-completion.store";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Check, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/shared/icon";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";

type Props = {
  activity: ActivityCompletionTarget;
  layout?: "icon" | "button";
};

export const ActivityCompleteToggle = observer(function ActivityCompleteToggle({ activity, layout = "icon" }: Props) {
  const t = useTranslations();
  const { activityCompletionStore, tasksStore } = useRootStore();

  const isCompleted = activity.completedAt !== null;
  const isBusy = activityCompletionStore.isPending(activity.id);
  const label = isCompleted ? t("Activities.completion.reopen") : t("Activities.completion.complete");

  if (tasksStore.isDisabled) return null;

  const press = () => runUserAction(() => activityCompletionStore.toggle(activity));

  if (layout === "button") {
    return (
      <Button disabled={isBusy} size="sm" type="button" variant="secondary" onClick={press}>
        <Icon icon={isCompleted ? Undo2 : Check} size="sm" />

        {label}
      </Button>
    );
  }

  return (
    <Button
      aria-label={label}
      aria-pressed={isCompleted}
      disabled={isBusy}
      size="icon-sm"
      title={label}
      type="button"
      variant={isCompleted ? "secondary" : "ghost"}
      onClick={(event) => {
        event.stopPropagation();
        press();
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <Icon className={isCompleted ? "text-success" : "text-muted-foreground"} icon={Check} size="sm" />
    </Button>
  );
});
