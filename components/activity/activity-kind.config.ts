import type { LucideIcon } from "lucide-react";

import { ActivityKind } from "@/generated/prisma";
import { CalendarClock, CheckSquare, Flag, Mail, Phone, Users, UtensilsCrossed } from "lucide-react";

export const ACTIVITY_KIND_ICON: Record<ActivityKind, LucideIcon> = {
  [ActivityKind.call]: Phone,
  [ActivityKind.meeting]: Users,
  [ActivityKind.email]: Mail,
  [ActivityKind.task]: CheckSquare,
  [ActivityKind.deadline]: Flag,
  [ActivityKind.lunch]: UtensilsCrossed,
};

export const UNSPECIFIED_ACTIVITY_ICON: LucideIcon = CalendarClock;

export const ACTIVITY_KIND_VALUES: ActivityKind[] = Object.values(ActivityKind);

export function activityKindIcon(kind: ActivityKind | null | undefined): LucideIcon {
  return kind ? ACTIVITY_KIND_ICON[kind] : UNSPECIFIED_ACTIVITY_ICON;
}

export function activityKindLabelKey(kind: ActivityKind | null | undefined): string {
  return kind ? `Common.activityKinds.${kind}` : "Common.activityKinds.unspecified";
}
