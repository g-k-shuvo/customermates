"use client";

import { useTranslations } from "next-intl";
import { CampaignStatus } from "@/generated/prisma";

import { Badge } from "@/components/ui/badge";

const STATUS_BADGE = {
  draft: "secondary",
  sending: "info",
  sent: "success",
  cancelled: "outline",
  failed: "destructive",
} as const satisfies Record<CampaignStatus, string>;

export function useCampaignStatusLabel() {
  const t = useTranslations();

  return (status: CampaignStatus) => {
    switch (status) {
      case CampaignStatus.draft:
        return t("Campaigns.status.draft");
      case CampaignStatus.sending:
        return t("Campaigns.status.sending");
      case CampaignStatus.sent:
        return t("Campaigns.status.sent");
      case CampaignStatus.cancelled:
        return t("Campaigns.status.cancelled");
      case CampaignStatus.failed:
        return t("Campaigns.status.failed");
    }
  };
}

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const label = useCampaignStatusLabel();

  return (
    <Badge data-campaign-status={status} variant={STATUS_BADGE[status]}>
      {label(status)}
    </Badge>
  );
}
