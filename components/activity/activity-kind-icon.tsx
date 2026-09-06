"use client";

import type { ActivityKind } from "@/generated/prisma";

import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";

import { activityKindIcon, activityKindLabelKey } from "./activity-kind.config";

export function useActivityKindLabel() {
  const t = useTranslations();

  return (kind: ActivityKind | null | undefined) => t(activityKindLabelKey(kind));
}

type Props = {
  kind: ActivityKind | null | undefined;
  className?: string;
  size?: "sm" | "md" | "lg";
};

export function ActivityKindIcon({ kind, className, size = "md" }: Props) {
  const activityKindLabel = useActivityKindLabel();

  return <Icon aria-label={activityKindLabel(kind)} className={className} icon={activityKindIcon(kind)} size={size} />;
}
