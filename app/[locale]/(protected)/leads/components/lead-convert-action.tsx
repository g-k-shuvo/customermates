"use client";

import type { LeadDto } from "@/features/leads/lead.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { ArrowRightLeft } from "lucide-react";
import { Action, EntityType, Resource } from "@/generated/prisma";

import { Button } from "@/components/ui/button";
import { useOpenEntity } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";

import { canConvertLead } from "./lead-convert.store";

type Props = {
  lead: Pick<LeadDto, "id" | "convertedDealId"> | null | undefined;
};

export const LeadConvertAction = observer(function LeadConvertAction({ lead }: Props) {
  const t = useTranslations();
  const { leadConvertStore, leadsStore, userStore } = useRootStore();
  const openEntity = useOpenEntity();

  const canCreateDeals = userStore.can(Resource.deals, Action.create);
  if (!lead || leadsStore.isDisabled || !canCreateDeals || !canConvertLead(lead)) return null;

  const leadId = lead.id;

  return (
    <Button
      disabled={leadConvertStore.isSubmitting}
      size="sm"
      type="button"
      variant="secondary"
      onClick={() =>
        runUserAction(async () => {
          const dealId = await leadConvertStore.convert(leadId);
          if (dealId) openEntity(EntityType.deal, dealId);
        })
      }
    >
      <ArrowRightLeft className="size-4" />

      {t("LeadDetail.convert")}
    </Button>
  );
});
