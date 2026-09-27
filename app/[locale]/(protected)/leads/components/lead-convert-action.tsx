"use client";

import type { LeadDto } from "@/features/leads/lead.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { ArrowRightLeft } from "lucide-react";
import { Action, Resource } from "@/generated/prisma";

import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";

import { canConvertLead } from "./lead-convert.store";

type Props = {
  lead: Pick<LeadDto, "id" | "convertedDealId" | "title" | "value"> | null | undefined;
};

export const LeadConvertAction = observer(function LeadConvertAction({ lead }: Props) {
  const t = useTranslations();
  const { leadConvertStore, leadsStore, userStore } = useRootStore();

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
