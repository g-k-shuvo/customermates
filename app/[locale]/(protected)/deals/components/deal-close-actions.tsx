"use client";

import type { DealCloseTarget } from "./deal-close-transitions";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { MoreHorizontal, RotateCcw, ThumbsDown, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";

import { canCloseDeal, canReopenDeal } from "./deal-close-transitions";

type Props = {
  deal: DealCloseTarget | null | undefined;
  layout?: "buttons" | "menu";
};

export const DealCloseActions = observer(function DealCloseActions({ deal, layout = "buttons" }: Props) {
  const t = useTranslations();
  const { dealCloseStore, dealsStore } = useRootStore();

  const canClose = canCloseDeal(deal);
  const canReopen = canReopenDeal(deal);
  if (!deal || dealsStore.isDisabled || (!canClose && !canReopen)) return null;

  const dealId = deal.id;
  const isBusy = dealCloseStore.isSubmitting;

  if (layout === "menu") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={t("DealModal.close.menuLabel")}
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
          {canClose && (
            <DropdownMenuItem disabled={isBusy} onSelect={() => runUserAction(() => dealCloseStore.markWon(dealId))}>
              <Trophy className="size-4" />

              {t("DealModal.close.markWon")}
            </DropdownMenuItem>
          )}

          {canClose && (
            <DropdownMenuItem
              disabled={isBusy}
              onSelect={() => runUserAction(() => dealCloseStore.openLostPrompt(dealId))}
            >
              <ThumbsDown className="size-4" />

              {t("DealModal.close.markLost")}
            </DropdownMenuItem>
          )}

          {canReopen && (
            <DropdownMenuItem disabled={isBusy} onSelect={() => runUserAction(() => dealCloseStore.reopen(dealId))}>
              <RotateCcw className="size-4" />

              {t("DealModal.close.reopen")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canClose && (
        <Button
          disabled={isBusy}
          size="sm"
          type="button"
          variant="secondary"
          onClick={() => runUserAction(() => dealCloseStore.markWon(dealId))}
        >
          <Trophy className="size-3.5" />

          {t("DealModal.close.markWon")}
        </Button>
      )}

      {canClose && (
        <Button
          disabled={isBusy}
          size="sm"
          type="button"
          variant="secondary"
          onClick={() => runUserAction(() => dealCloseStore.openLostPrompt(dealId))}
        >
          <ThumbsDown className="size-3.5" />

          {t("DealModal.close.markLost")}
        </Button>
      )}

      {canReopen && (
        <Button
          disabled={isBusy}
          size="sm"
          type="button"
          variant="secondary"
          onClick={() => runUserAction(() => dealCloseStore.reopen(dealId))}
        >
          <RotateCcw className="size-3.5" />

          {t("DealModal.close.reopen")}
        </Button>
      )}
    </div>
  );
});
