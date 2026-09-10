"use client";

import type { ReactNode } from "react";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { DealDto } from "@/features/deals/deal.schema";
import type { PipelineDto } from "@/features/pipelines/pipeline.schema";

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

import { DealCloseActions } from "./deal-close-actions";
import { hasActiveDealQuery } from "./deal-board-filters";
import { DealNextActivityFilterChip } from "./deal-next-activity-filter-chip";
import { DealPipelineSwitcher } from "./deal-pipeline-switcher";
import { DealRottingFilterChip } from "./deal-rotting-filter-chip";
import { DealsPageSkeleton } from "./deals-page-skeleton";
import { useDealColumns } from "./use-deal-columns";
import { useDealPipelineSync } from "./use-deal-pipeline-sync";

type Props = { deals: GetResult<DealDto>; forecastsByStage: boolean; pipelines: PipelineDto[] };

export const DealsPageView = observer(function DealsPageView({ deals, forecastsByStage, pipelines }: Props) {
  const { contactsStore, dealsStore, importWizardStore, organizationsStore, servicesStore } = useRootStore();

  useDataViewSync(dealsStore, deals, [organizationsStore, contactsStore, servicesStore]);
  useDealPipelineSync(dealsStore, pipelines);

  const openEntity = useOpenEntity();
  const entityHref = useEntityHref();
  const columns = useDealColumns(forecastsByStage);
  const { plural, singular } = useEntityTerminology();
  const t = useTranslations();

  const view = resolveDataViewView(dealsStore.viewMode, dealsStore.groupingColumnId);
  const pageState = resolveDataViewPageState({
    explicitlyUnpaginated: false,
    hasActiveQuery: hasActiveDealQuery({ filters: dealsStore.filters, searchTerm: dealsStore.searchTerm }),
    itemCount: dealsStore.items.length,
    request: dealsStore.dataRequest,
    total: dealsStore.pagination?.total,
  });
  const emptyActionLabel = t("Common.emptyState.cta", { singular: singular(EntityType.deal) });
  const selectedPipeline = dealsStore.selectedPipeline;
  const pipelineEmptyDescriptor = selectedPipeline
    ? {
        title: t("DealModal.pipeline.emptyTitle", { pipeline: selectedPipeline.name }),
        body: t("DealModal.pipeline.emptyBody", { plural: plural(EntityType.deal) }),
      }
    : undefined;
  const handleAdd = useCallback(() => openEntity(EntityType.deal, "new"), [openEntity]);
  const rowHref = useCallback((deal: DealDto) => entityHref(EntityType.deal, deal.id), [entityHref]);
  const handleExport = useExportAction(dealsStore);
  const handleImport = useCallback(
    () => importWizardStore.openForEntity(EntityType.deal, () => dealsStore.refresh()),
    [importWizardStore, dealsStore],
  );
  const cardActions = useCallback((deal: DealDto) => <DealCloseActions deal={deal} layout="menu" />, []);
  const topBarNode = useMemo(
    () => (
      <div className="flex items-center gap-1">
        <DealPipelineSwitcher />

        <DealRottingFilterChip />

        <DealNextActivityFilterChip />

        <DataViewToolbar
          addLabel={pageState === "true-empty" ? emptyActionLabel : undefined}
          anchorScope="deals"
          store={dealsStore}
          onAdd={handleAdd}
          onExport={handleExport}
          onImport={handleImport}
        />
      </div>
    ),
    [dealsStore, emptyActionLabel, handleAdd, handleExport, handleImport, pageState],
  );
  useSetTopBarActions(topBarNode);

  let body: ReactNode;
  switch (pageState) {
    case "error":
      body = (
        <PageState
          action={
            <Button size="sm" variant="secondary" onClick={() => dealsStore.setQueryOptions({ forceRefresh: true })}>
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
        <PageState background={<DealsPageSkeleton view={view} />} label={t("PageState.loading")} state="loading" />
      );
      break;
    case "filtered-empty":
      body = <DataViewEmpty filteredDescriptor={pipelineEmptyDescriptor} reason="filtered" store={dealsStore} />;
      break;
    case "true-empty":
      body = (
        <DataViewEmpty
          actionLabel={emptyActionLabel}
          background={<DealsPageSkeleton animated={false} view={view} />}
          reason="true-empty"
          store={dealsStore}
          onAdd={handleAdd}
        />
      );
      break;
    case "content":
      body = (
        <DataViewContent cardActions={cardActions} columns={columns} rowHref={rowHref} store={dealsStore} view={view} />
      );
      break;
    default: {
      const exhaustive: never = pageState;
      body = exhaustive;
    }
  }

  return (
    <DataViewLayout showPagination={pageState === "content" && view !== "board"} store={dealsStore}>
      {body}
    </DataViewLayout>
  );
});
