"use client";

import type { ReactNode } from "react";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { LeadDto } from "@/features/leads/lead.schema";

import { observer } from "mobx-react-lite";
import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { EntityType } from "@/generated/prisma";

import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { DataViewContent } from "@/components/data-view/data-view-content";
import { DataViewEmpty } from "@/components/data-view/data-view-empty";
import { DataViewLayout } from "@/components/data-view/data-view-layout";
import { resolveDataViewPageState, resolveDataViewView } from "@/components/data-view/data-view-state";
import { DataViewToolbar } from "@/components/data-view/data-view-toolbar";
import { useDataViewSync } from "@/components/data-view/use-data-view-sync";
import { useExportAction } from "@/features/data-transfer/export/use-export-download";
import { useEntityHref, useOpenEntity } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { PageState } from "@/components/page-state/page-state";
import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";

import { LeadsPageSkeleton } from "./leads-page-skeleton";
import { useLeadColumns } from "./use-lead-columns";

type Props = {
  leads: GetResult<LeadDto>;
};

export const LeadsPageView = observer(function LeadsPageView({ leads }: Props) {
  const { contactsStore, importWizardStore, leadsStore, organizationsStore } = useRootStore();

  useDataViewSync(leadsStore, leads, [contactsStore, organizationsStore]);
  const openEntity = useOpenEntity();
  const entityHref = useEntityHref();
  const columns = useLeadColumns();
  const { singular } = useEntityTerminology();
  const t = useTranslations();

  const view = resolveDataViewView(leadsStore.viewMode, leadsStore.isGrouped);
  const hasActiveQuery = Boolean(leadsStore.searchTerm?.trim()) || (leadsStore.filters?.length ?? 0) > 0;
  const pageState = resolveDataViewPageState({
    explicitlyUnpaginated: false,
    hasActiveQuery,
    itemCount: leadsStore.items.length,
    request: leadsStore.dataRequest,
    total: leadsStore.pagination?.total,
  });
  const emptyActionLabel = t("Common.emptyState.cta", { singular: singular(EntityType.lead) });
  const handleAdd = useCallback(() => openEntity(EntityType.lead, "new"), [openEntity]);
  const rowHref = useCallback((lead: LeadDto) => entityHref(EntityType.lead, lead.id), [entityHref]);
  const handleExport = useExportAction(leadsStore);
  const handleImport = useCallback(
    () => importWizardStore.openForEntity(EntityType.lead, () => leadsStore.refresh()),
    [importWizardStore, leadsStore],
  );
  const topBarNode = useMemo(
    () => (
      <DataViewToolbar
        addLabel={pageState === "true-empty" ? emptyActionLabel : undefined}
        anchorScope="leads"
        store={leadsStore}
        onAdd={handleAdd}
        onExport={handleExport}
        onImport={handleImport}
      />
    ),
    [emptyActionLabel, handleAdd, handleExport, handleImport, leadsStore, pageState],
  );

  useSetTopBarActions(topBarNode);

  let body: ReactNode;
  switch (pageState) {
    case "error":
      body = (
        <PageState
          action={
            <Button size="sm" variant="secondary" onClick={() => leadsStore.setQueryOptions({ forceRefresh: true })}>
              {t("ErrorCard.retry")}
            </Button>
          }
          description={t("ErrorCard.contactSupport")}
          state="error"
          title={t("ErrorCard.title")}
        />
      );
      break;
    case "loading":
      body = (
        <PageState background={<LeadsPageSkeleton view={view} />} label={t("PageState.loading")} state="loading" />
      );
      break;
    case "filtered-empty":
      body = <DataViewEmpty reason="filtered" store={leadsStore} />;
      break;
    case "true-empty":
      body = (
        <DataViewEmpty
          actionLabel={emptyActionLabel}
          background={<LeadsPageSkeleton animated={false} view={view} />}
          reason="true-empty"
          store={leadsStore}
          onAdd={handleAdd}
        />
      );
      break;
    case "content":
      body = <DataViewContent columns={columns} rowHref={rowHref} store={leadsStore} view={view} />;
      break;
    default: {
      const exhaustive: never = pageState;
      body = exhaustive;
    }
  }

  return (
    <DataViewLayout showPagination={pageState === "content" && view !== "board"} store={leadsStore}>
      {body}
    </DataViewLayout>
  );
});
