"use client";

import type { ActivityKind } from "@/generated/prisma";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { ActivityKindIcon } from "./activity-kind-icon";

type Props = {
  activityKind?: ActivityKind | null;
  dueAt: Date | null;
  isOverdue: boolean;
  isCompleted?: boolean;
  size?: "sm" | "md" | "lg";
};

export const ActivityDueBadge = observer(function ActivityDueBadge({
  activityKind,
  dueAt,
  isOverdue,
  isCompleted = false,
  size = "sm",
}: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();

  if (!dueAt) return null;

  const formatted = intlStore.formatDescriptiveShortDateTime(dueAt);
  const variant = isCompleted ? "success" : isOverdue ? "destructive" : "secondary";

  return (
    <AppChip
      size={size}
      startContent={<ActivityKindIcon className="opacity-70" kind={activityKind} size="sm" />}
      tooltip={isOverdue && !isCompleted ? t("Common.filters.overdueValues.overdue") : undefined}
      variant={variant}
    >
      <span suppressHydrationWarning>{formatted}</span>
    </AppChip>
  );
});
