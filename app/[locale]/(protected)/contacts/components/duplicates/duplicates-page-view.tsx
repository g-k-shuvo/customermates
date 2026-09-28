"use client";

import type { ReactNode } from "react";
import type { DuplicateEntityType, DuplicateGroupListDto } from "@/features/duplicates/duplicate.schema";

import { Users } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Action, EntityType } from "@/generated/prisma";

import { PageState } from "@/components/page-state/page-state";
import { Button } from "@/components/ui/button";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { DUPLICATE_RESOURCE } from "@/features/duplicates/duplicate-access";

import { DUPLICATE_POLL_INTERVAL_MS } from "./duplicates.store";
import { DuplicateGroupCard } from "./duplicate-group-card";
import { DuplicatesPageSkeleton } from "./duplicates-page-skeleton";
import { MergeContactsModal } from "./merge-contacts-modal";
import { RecentMerges } from "./recent-merges";

type Props = { entityType: DuplicateEntityType; initial: DuplicateGroupListDto };

export const DuplicatesPageView = observer(({ entityType, initial }: Props) => {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { plural } = useEntityTerminology();
  const { contactDuplicatesStore, organizationDuplicatesStore, layoutStore, userStore } = useRootStore();
  const store = entityType === EntityType.contact ? contactDuplicatesStore : organizationDuplicatesStore;
  const resource = DUPLICATE_RESOURCE[entityType];
  const canDismiss = userStore.can(resource, Action.update);
  const canMerge = canDismiss && userStore.can(resource, Action.delete);
  const title = t("Duplicates.title", { entities: plural(entityType) });
  const runtimeIdentityKey = `${entityType === EntityType.contact ? "contacts" : "organizations"}:duplicates`;

  useEffect(() => store.hydrate(initial), [store, initial]);

  useEffect(() => {
    void store.loadMerges().catch(reportApplicationError);
  }, [store]);

  useEffect(() => {
    layoutStore.setRuntimeIdentity({
      scope: "entity",
      key: runtimeIdentityKey,
      title,
      pictureUrl: null,
      avatarKind: null,
    });

    return () => layoutStore.clearRuntimeIdentity("entity", runtimeIdentityKey);
  }, [layoutStore, title, runtimeIdentityKey]);

  useEffect(() => {
    if (!store.isScanning) return;

    const timer = setInterval(() => void store.load().catch(reportApplicationError), DUPLICATE_POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [store, store.isScanning]);

  const scan = store.data?.scan ?? null;
  const pageState = store.pageState;

  let status: string;
  if (!scan) status = t("Duplicates.neverScanned");
  else if (scan.status === "running") status = t("Duplicates.scanning");
  else if (scan.status === "failed") status = t("Duplicates.scanFailed");
  else {
    status = t("Duplicates.lastScan", {
      date: intlStore.formatDescriptiveShortDateTime(scan.finishedAt ?? scan.startedAt),
      groups: scan.groupCount,
      records: scan.recordCount,
    });
  }

  let body: ReactNode;
  switch (pageState) {
    case "loading":
      body = <PageState background={<DuplicatesPageSkeleton />} label={t("PageState.loading")} state="loading" />;
      break;
    case "error":
      body = (
        <PageState
          action={
            <Button size="sm" variant="secondary" onClick={() => runUserAction(() => store.load())}>
              {t("ErrorCard.retry")}
            </Button>
          }
          description={t("ErrorCard.contactSupport")}
          state="error"
          title={t("ErrorCard.title")}
        />
      );
      break;
    case "empty":
      body = (
        <PageState
          background={<DuplicatesPageSkeleton />}
          description={scan ? t("Duplicates.emptyDescription") : t("Duplicates.neverScannedDescription")}
          icon={Users}
          state="empty"
          title={scan ? t("Duplicates.emptyTitle") : t("Duplicates.neverScannedTitle")}
        />
      );
      break;
    case "content": {
      const data = store.data;
      const lastPage = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
      body = (
        <div className="flex flex-col gap-3">
          {data?.groups.map((group) => (
            <DuplicateGroupCard
              key={group.id}
              canDismiss={canDismiss}
              canMerge={canMerge}
              group={group}
              store={store}
            />
          ))}

          {lastPage > 1 && data && (
            <div className="flex items-center justify-end gap-2">
              <span className="text-sm text-muted-foreground">
                {t("Duplicates.page", { page: data.page, pages: lastPage })}
              </span>

              <Button
                disabled={data.page <= 1}
                size="sm"
                variant="secondary"
                onClick={() => runUserAction(() => store.load(data.page - 1))}
              >
                {t("Duplicates.previous")}
              </Button>

              <Button
                disabled={data.page >= lastPage}
                size="sm"
                variant="secondary"
                onClick={() => runUserAction(() => store.load(data.page + 1))}
              >
                {t("Duplicates.next")}
              </Button>
            </div>
          )}
        </div>
      );
      break;
    }
    default: {
      const exhaustive: never = pageState;
      throw new Error(String(exhaustive));
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-lg font-semibold">{title}</h1>

          <p className="text-sm text-muted-foreground">
            {entityType === EntityType.contact ? t("Duplicates.description") : t("Duplicates.organizationDescription")}
          </p>

          <p aria-live="polite" className="text-sm" data-duplicate-scan-status={scan?.status ?? "none"}>
            {status}
          </p>

          {scan && scan.skippedBuckets.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("Duplicates.skipped", { count: scan.skippedBuckets.length })}
            </p>
          )}
        </div>

        <Button
          disabled={store.isScanning || store.isStarting}
          size="sm"
          onClick={() => runUserAction(() => store.startScan())}
        >
          {store.isScanning ? t("Duplicates.scanning") : t("Duplicates.scan")}
        </Button>
      </header>

      {body}

      <RecentMerges canUndo={canMerge} store={store} />

      <MergeContactsModal store={store} />
    </div>
  );
});
