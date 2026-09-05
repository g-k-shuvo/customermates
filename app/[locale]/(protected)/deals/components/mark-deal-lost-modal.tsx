"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppForm } from "@/components/forms/form-context";
import { FormSelect } from "@/components/forms/form-select";
import { FormTextarea } from "@/components/forms/form-textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useOverlayFocusReturn } from "@/components/ui/use-overlay-focus-return";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";

export const MarkDealLostModal = observer(() => {
  const t = useTranslations();
  const { dealCloseStore: store, lostReasonsStore } = useRootStore();

  const isOpen = store.isLostPromptOpen;
  const focusReturn = useOverlayFocusReturn(isOpen);
  const items = store.lostReasons.map((lostReason) => ({ value: lostReason.id, label: lostReason.name }));
  const hasReasons = items.length > 0;

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) store.closeLostPrompt();
      }}
    >
      <AlertDialogContent className="flex flex-col gap-0 border-0 bg-transparent p-0 shadow-none" {...focusReturn}>
        <AppForm store={store}>
          <AppCard>
            <AppCardHeader>
              <AlertDialogTitle className="text-base font-semibold">{t("DealModal.close.lostTitle")}</AlertDialogTitle>
            </AppCardHeader>

            <AppCardBody>
              <AlertDialogDescription className="text-sm text-foreground">
                {hasReasons ? t("DealModal.close.lostDescription") : t("DealModal.close.noLostReasons")}
              </AlertDialogDescription>

              {hasReasons && (
                <>
                  <FormSelect
                    required
                    id="lostReasonId"
                    items={items}
                    label={t("DealModal.close.lostReasonLabel")}
                    optionsLoading={lostReasonsStore.isLoading}
                    placeholder={t("DealModal.close.lostReasonPlaceholder")}
                  />

                  <FormTextarea
                    id="lostNotes"
                    label={t("DealModal.close.lostNotesLabel")}
                    placeholder={t("DealModal.close.lostNotesPlaceholder")}
                    rows={3}
                  />
                </>
              )}
            </AppCardBody>

            <AppCardFooter>
              <AlertDialogCancel disabled={store.isSubmitting}>{t("Common.actions.cancel")}</AlertDialogCancel>

              <AlertDialogAction
                disabled={!hasReasons || !store.canSubmitLost}
                variant="destructive"
                onClick={(event) => {
                  event.preventDefault();
                  runUserAction(() => store.confirmLost());
                }}
              >
                {t("DealModal.close.markLost")}
              </AlertDialogAction>
            </AppCardFooter>
          </AppCard>
        </AppForm>
      </AlertDialogContent>
    </AlertDialog>
  );
});
