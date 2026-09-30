"use client";

import type { DealDto } from "@/features/deals/deal.schema";

import { useTranslations } from "next-intl";
import { Target } from "lucide-react";
import { EntityType } from "@/generated/prisma";

import { AppLink } from "@/components/shared/app-link";
import { useEntityHref } from "@/components/entity-detail/hooks/use-entity-drawer-stack";

type Props = {
  deal: Pick<DealDto, "sourceLead"> | null | undefined;
};

export function DealSourceLeadLink({ deal }: Props) {
  const t = useTranslations();
  const entityHref = useEntityHref();
  const lead = deal?.sourceLead;
  if (!lead) return null;

  return (
    <p className="flex items-center gap-1.5 text-sm text-muted-foreground" data-deal-source-lead={lead.id}>
      <Target aria-hidden="true" className="size-4 shrink-0" />

      {t("DealModal.fromLead")}

      <AppLink className="truncate" href={entityHref(EntityType.lead, lead.id)}>
        {lead.title}
      </AppLink>
    </p>
  );
}
