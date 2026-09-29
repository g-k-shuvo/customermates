"use client";

import type { ReactNode } from "react";
import type { CampaignDto } from "@/features/campaigns/campaign.schema";

import { Megaphone, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Action, Resource } from "@/generated/prisma";

import { createCampaignAction } from "../actions";

import { CampaignStatusBadge } from "./campaign-status-badge";
import { CampaignsPageSkeleton } from "./campaigns-page-skeleton";

import { PageState } from "@/components/page-state/page-state";
import { AppLink } from "@/components/shared/app-link";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { runUserAction } from "@/core/errors/report-application-error";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { useRootStore } from "@/core/stores/root-store.provider";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { useRouter } from "@/i18n/navigation";

type PageStateKind = "true-empty" | "content";

export function CampaignsPageView({ initial }: { initial: CampaignDto[] }) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const router = useRouter();
  const { layoutStore, userStore } = useRootStore();
  const [isCreating, setIsCreating] = useState(false);
  const canWrite = userStore.can(Resource.campaigns, Action.update);
  const title = t("Campaigns.title");

  useEffect(() => {
    layoutStore.setRuntimeIdentity({ scope: "entity", key: "campaigns", title, pictureUrl: null, avatarKind: null });

    return () => layoutStore.clearRuntimeIdentity("entity", "campaigns");
  }, [layoutStore, title]);

  const create = () =>
    runUserAction(async () => {
      setIsCreating(true);
      try {
        const result = await createCampaignAction({ name: t("Campaigns.untitled") });
        if (!result.ok) {
          toastZodErrorTree(result.error);
          return;
        }

        router.push(`/campaigns/${result.data.id}`);
      } finally {
        setIsCreating(false);
      }
    });

  const pageState: PageStateKind = initial.length > 0 ? "content" : "true-empty";
  let body: ReactNode;
  switch (pageState) {
    case "true-empty":
      body = (
        <PageState
          background={<CampaignsPageSkeleton />}
          description={t("Campaigns.emptyDescription")}
          icon={Megaphone}
          state="empty"
          title={t("Campaigns.emptyTitle")}
        />
      );
      break;
    case "content":
      body = (
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table data-campaigns-table="">
            <TableHeader>
              <TableRow>
                <TableHead>{t("Campaigns.columns.name")}</TableHead>

                <TableHead>{t("Campaigns.columns.status")}</TableHead>

                <TableHead className="text-right">{t("Campaigns.columns.sent")}</TableHead>

                <TableHead className="text-right">{t("Campaigns.columns.suppressed")}</TableHead>

                <TableHead className="text-right">{t("Campaigns.columns.failed")}</TableHead>

                <TableHead>{t("Campaigns.columns.created")}</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {initial.map((campaign) => (
                <TableRow key={campaign.id} data-campaign-row={campaign.id}>
                  <TableCell className="font-medium">
                    <AppLink href={`/campaigns/${campaign.id}`}>{campaign.name}</AppLink>
                  </TableCell>

                  <TableCell>
                    <CampaignStatusBadge status={campaign.status} />
                  </TableCell>

                  <TableCell className="text-right tabular-nums">
                    {intlStore.formatNumber(campaign.sentCount)}
                  </TableCell>

                  <TableCell className="text-right tabular-nums">
                    {intlStore.formatNumber(campaign.suppressedCount)}
                  </TableCell>

                  <TableCell className="text-right tabular-nums">
                    {intlStore.formatNumber(campaign.failedCount)}
                  </TableCell>

                  <TableCell>{intlStore.formatNumericalShortDate(campaign.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      );
      break;
    default: {
      const exhaustive: never = pageState;
      throw new Error(String(exhaustive));
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-x-lg font-semibold">{title}</h1>

          <p className="text-sm text-muted-foreground">{t("Campaigns.subtitle")}</p>
        </div>

        {canWrite ? (
          <Button disabled={isCreating} id="campaign-create" type="button" onClick={create}>
            <Plus className="size-4" />

            {t("Campaigns.create")}
          </Button>
        ) : null}
      </div>

      {body}
    </div>
  );
}
