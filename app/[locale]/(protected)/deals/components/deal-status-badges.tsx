"use client";

import { Hourglass } from "lucide-react";
import { useTranslations } from "next-intl";
import { DealStatus } from "@/generated/prisma";

import { AppChip } from "@/components/chip/app-chip";

type Translate = (key: string) => string;

function dealStatusLabel(status: DealStatus, t: Translate): string {
  if (status === DealStatus.won) return t("Common.dealStatuses.won");
  if (status === DealStatus.lost) return t("Common.dealStatuses.lost");

  return t("Common.dealStatuses.open");
}

function dealStatusVariant(status: DealStatus): "success" | "destructive" | "secondary" {
  if (status === DealStatus.won) return "success";
  if (status === DealStatus.lost) return "destructive";

  return "secondary";
}

export function DealStatusBadge({ lostReasonName, status }: { lostReasonName?: string | null; status: DealStatus }) {
  const t = useTranslations();
  const label = dealStatusLabel(status, t);
  const reason = status === DealStatus.lost && lostReasonName ? lostReasonName : undefined;

  return (
    <AppChip tooltip={reason} variant={dealStatusVariant(status)}>
      {reason ? `${label} · ${reason}` : label}
    </AppChip>
  );
}

export function DealRottingBadge({ isRotting }: { isRotting: boolean }) {
  const t = useTranslations();

  if (!isRotting) return null;

  return (
    <AppChip startContent={<Hourglass aria-hidden="true" className="size-3 opacity-70" />} variant="warning">
      {t("Common.filters.rottingValues.rotting")}
    </AppChip>
  );
}
