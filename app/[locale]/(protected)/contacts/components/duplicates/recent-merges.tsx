"use client";

import type { DuplicatesStore } from "./duplicates.store";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppLink } from "@/components/shared/app-link";
import { Button } from "@/components/ui/button";
import { useEntityHref } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { runUserAction } from "@/core/errors/report-application-error";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

export const RecentMerges = observer(({ store, canUndo }: { store: DuplicatesStore; canUndo: boolean }) => {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const entityHref = useEntityHref();

  if (store.merges.length === 0) return null;

  return (
    <section aria-labelledby="recent-merges-title" className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold" id="recent-merges-title">
        {t("Duplicates.merges.title")}
      </h2>

      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
        {store.merges.map((merge) => (
          <li key={merge.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div className="flex min-w-0 flex-col">
              <span className="flex flex-wrap gap-x-1 text-sm">
                {merge.winner ? (
                  <AppLink className="font-medium" href={entityHref(store.entityType, merge.winner.id) ?? "#"}>
                    {merge.winner.name}
                  </AppLink>
                ) : (
                  <span className="font-medium">{t("Duplicates.merges.winnerGone")}</span>
                )}

                <span>{t("Duplicates.merges.absorbed", { names: merge.loserNames.join(", ") })}</span>
              </span>

              <span className="text-xs text-muted-foreground">
                {merge.undoneAt
                  ? t("Duplicates.merges.undoneAt", { date: intlStore.formatDescriptiveShortDateTime(merge.undoneAt) })
                  : t("Duplicates.merges.mergedAt", {
                      date: intlStore.formatDescriptiveShortDateTime(merge.createdAt),
                      name: merge.mergedBy ? `${merge.mergedBy.firstName} ${merge.mergedBy.lastName}`.trim() : "",
                    })}
              </span>
            </div>

            {canUndo && merge.undoable && (
              <Button
                disabled={store.undoingIds.has(merge.id)}
                size="sm"
                variant="secondary"
                onClick={() => runUserAction(() => store.undo(merge.id, t("Duplicates.merge.undone")))}
              >
                {t("Duplicates.merge.undo")}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
});
