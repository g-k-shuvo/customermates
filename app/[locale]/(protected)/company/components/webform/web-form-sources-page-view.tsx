"use client";

import type { ReactNode } from "react";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { WebFormSourceDto } from "@/features/webform/webform-source.schema";

import { observer } from "mobx-react-lite";
import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";

import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { DataViewContent } from "@/components/data-view/data-view-content";
import { DataViewEmpty } from "@/components/data-view/data-view-empty";
import { DataViewLayout } from "@/components/data-view/data-view-layout";
import { resolveDataViewPageState, resolveDataViewView } from "@/components/data-view/data-view-state";
import { DataViewToolbar } from "@/components/data-view/data-view-toolbar";
import { useDataViewSync } from "@/components/data-view/use-data-view-sync";
import { PageState } from "@/components/page-state/page-state";
import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";

import { useWebFormSourceColumns } from "./use-web-form-source-columns";
import { WebFormSourcesPageSkeleton } from "./web-form-sources-page-skeleton";

type Props = { initialSources: GetResult<WebFormSourceDto> };

export const WebFormSourcesPageView = observer(function WebFormSourcesPageView({ initialSources }: Props) {
  const { webFormSourceModalStore, webFormSourcesStore } = useRootStore();

  useDataViewSync(webFormSourcesStore, initialSources);
  const columns = useWebFormSourceColumns();
  const t = useTranslations();

  const view = resolveDataViewView(webFormSourcesStore.viewMode, webFormSourcesStore.groupingColumnId);
  const pageState = resolveDataViewPageState({
    explicitlyUnpaginated: false,
    hasActiveQuery: Boolean(webFormSourcesStore.searchTerm?.trim()) || (webFormSourcesStore.filters?.length ?? 0) > 0,
    itemCount: webFormSourcesStore.items.length,
    request: webFormSourcesStore.dataRequest,
    total: webFormSourcesStore.pagination?.total,
  });
  const descriptor = { title: t("WebFormSourcesCard.emptyTitle"), body: t("WebFormSourcesCard.emptyBody") };
  const handleAdd = useCallback(() => webFormSourceModalStore.openForCreate(), [webFormSourceModalStore]);
  const topBarNode = useMemo(
    () => (
      <DataViewToolbar
        addLabel={pageState === "true-empty" ? t("Common.actions.add") : undefined}
        anchorScope="company-web-forms"
        store={webFormSourcesStore}
        onAdd={handleAdd}
      />
    ),
    [handleAdd, pageState, t, webFormSourcesStore],
  );

  useSetTopBarActions(topBarNode);

  let body: ReactNode;
  switch (pageState) {
    case "error":
      body = (
        <PageState
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => webFormSourcesStore.setQueryOptions({ forceRefresh: true })}
            >
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
        <PageState
          background={<WebFormSourcesPageSkeleton view={view} />}
          label={t("PageState.loading")}
          state="loading"
        />
      );
      break;
    case "filtered-empty":
      body = <DataViewEmpty descriptor={descriptor} reason="filtered" store={webFormSourcesStore} />;
      break;
    case "true-empty":
      body = (
        <DataViewEmpty
          actionLabel={t("Common.actions.add")}
          background={<WebFormSourcesPageSkeleton animated={false} view={view} />}
          descriptor={descriptor}
          reason="true-empty"
          store={webFormSourcesStore}
          onAdd={handleAdd}
        />
      );
      break;
    case "content":
      body = (
        <DataViewContent
          columns={columns}
          store={webFormSourcesStore}
          view={view}
          onRowClick={(item) => webFormSourceModalStore.openForSource(item)}
        />
      );
      break;
    default: {
      const exhaustive: never = pageState;
      body = exhaustive;
    }
  }

  return (
    <DataViewLayout showPagination={pageState === "content" && view !== "board"} store={webFormSourcesStore}>
      {body}
    </DataViewLayout>
  );
});
