"use client";

import type { ReactNode } from "react";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { WebFormSubmissionDto } from "@/features/webform/submissions/web-form-submission.schema";

import { observer } from "mobx-react-lite";
import { useMemo } from "react";
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

import { useWebFormSubmissionColumns } from "./use-web-form-submission-columns";
import { WebFormSubmissionsPageSkeleton } from "./web-form-submissions-page-skeleton";

type Props = { initialSubmissions: GetResult<WebFormSubmissionDto> };

export const WebFormSubmissionsPageView = observer(function WebFormSubmissionsPageView({ initialSubmissions }: Props) {
  const { webFormSubmissionsStore, webFormSubmissionModalStore } = useRootStore();

  useDataViewSync(webFormSubmissionsStore, initialSubmissions);
  const columns = useWebFormSubmissionColumns();
  const t = useTranslations();
  const view = resolveDataViewView(webFormSubmissionsStore.viewMode, webFormSubmissionsStore.canBoard);
  const pageState = resolveDataViewPageState({
    explicitlyUnpaginated: false,
    hasActiveQuery:
      Boolean(webFormSubmissionsStore.searchTerm?.trim()) || (webFormSubmissionsStore.filters?.length ?? 0) > 0,
    isGrouped: webFormSubmissionsStore.isGrouped,
    itemCount: webFormSubmissionsStore.items.length,
    request: webFormSubmissionsStore.dataRequest,
    total: webFormSubmissionsStore.pagination?.total,
  });
  const descriptor = { title: t("WebFormSubmissions.emptyTitle"), body: t("WebFormSubmissions.emptyBody") };
  const topBarNode = useMemo(
    () => <DataViewToolbar anchorScope="company-web-form-submissions" store={webFormSubmissionsStore} />,
    [webFormSubmissionsStore],
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
              onClick={() => webFormSubmissionsStore.setQueryOptions({ forceRefresh: true })}
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
          background={<WebFormSubmissionsPageSkeleton view={view} />}
          label={t("PageState.loading")}
          state="loading"
        />
      );
      break;
    case "filtered-empty":
      body = <DataViewEmpty descriptor={descriptor} reason="filtered" store={webFormSubmissionsStore} />;
      break;
    case "true-empty":
      body = (
        <DataViewEmpty
          background={<WebFormSubmissionsPageSkeleton animated={false} view={view} />}
          descriptor={descriptor}
          reason="true-empty"
          store={webFormSubmissionsStore}
        />
      );
      break;
    case "content":
      body = (
        <DataViewContent
          columns={columns}
          store={webFormSubmissionsStore}
          view={view}
          onRowClick={(item) => {
            webFormSubmissionModalStore.onInitOrRefresh(item);
            webFormSubmissionModalStore.open();
          }}
        />
      );
      break;
    default: {
      const exhaustive: never = pageState;
      body = exhaustive;
    }
  }
  return (
    <DataViewLayout
      showPagination={pageState === "content" && view !== "board" && !webFormSubmissionsStore.isGrouped}
      store={webFormSubmissionsStore}
    >
      {body}
    </DataViewLayout>
  );
});
