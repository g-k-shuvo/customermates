"use client";

import type { LeadDto } from "@/features/leads/lead.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { ArrowRightLeft, CircleCheck } from "lucide-react";
import { Action, EntityType, Resource } from "@/generated/prisma";

import { AppLink } from "@/components/shared/app-link";
import { Button } from "@/components/ui/button";
import { useEntityHref } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";

import { canConvertLead } from "./lead-convert.store";

type Props = {
  lead: Pick<LeadDto, "id" | "convertedDealId" | "title" | "value"> | null | undefined;
};

export const LeadConvertAction = observer(function LeadConvertAction({ lead }: Props) {
  const t = useTranslations();
  const { leadConvertStore, leadsStore, userStore } = useRootStore();
  const entityHref = useEntityHref();

  if (lead?.convertedDealId) {
    return (
      <p
        className="flex items-center gap-1.5 text-sm text-muted-foreground"
        data-lead-converted-deal={lead.convertedDealId}
      >
        <CircleCheck aria-hidden="true" className="size-4 shrink-0" />

        {t("LeadDetail.convertedToDeal")}

        {userStore.can(Resource.deals, Action.readAll) || userStore.can(Resource.deals, Action.readOwn) ? (
          <AppLink href={entityHref(EntityType.deal, lead.convertedDealId)}>
            {t("LeadDetail.openConvertedDeal")}
          </AppLink>
        ) : null}
      </p>
    );
  }

  const canCreateDeals = userStore.can(Resource.deals, Action.create);
  if (!lead || leadsStore.isDisabled || !canCreateDeals || !canConvertLead(lead)) return null;

  return (
    <Button
      disabled={leadConvertStore.isOpen}
      size="sm"
      type="button"
      variant="secondary"
      onClick={() => runUserAction(() => leadConvertStore.prepare(lead))}
    >
      <ArrowRightLeft className="size-4" />

      {t("LeadDetail.convert")}
    </Button>
  );
});
