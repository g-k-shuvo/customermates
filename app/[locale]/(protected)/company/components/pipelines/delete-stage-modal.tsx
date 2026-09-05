"use client";

import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useLocale, useTranslations } from "next-intl";

import { EntityType } from "@/generated/prisma";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppForm } from "@/components/forms/form-context";
import { FormSelect } from "@/components/forms/form-select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { useOverlayFocusReturn } from "@/components/ui/use-overlay-focus-return";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";
import { terminologyLabelForSentence } from "@/features/entity-terminology/entity-terminology-label.utils";

export const DeleteStageModal = observer(() => {
  const locale = useLocale();
  const t = useTranslations();
  const { pipelinesStore: store, deleteStageModalStore: form } = useRootStore();
  const { plural, singular } = useEntityTerminology();
  const deals = terminologyLabelForSentence(plural(EntityType.deal), locale);
  const dealSingular = terminologyLabelForSentence(singular(EntityType.deal), locale);

  const prompt = store.stageDeletionPrompt;
  const isOpen = prompt !== null;
  const focusReturn = useOverlayFocusReturn(isOpen);
  const promptedStageId = prompt?.stageId ?? null;

  useEffect(() => {
    form.resetDestination();
  }, [form, promptedStageId]);

  const items = store.stageDeletionTargets.map((stage) => ({ value: stage.id, label: stage.name }));
  const canConfirm = form.moveToStageId !== "" && !store.isSaving;

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) store.cancelStageDeletion();
      }}
    >
      <AlertDialogContent className="flex flex-col gap-0 border-0 bg-transparent p-0 shadow-none" {...focusReturn}>
        <AppForm store={form}>
          <AppCard>
            <AppCardHeader>
              <AlertDialogTitle className="text-base font-semibold">
                {t("Pipelines.deleteStage.title", { deals })}
              </AlertDialogTitle>
            </AppCardHeader>

            <AppCardBody>
              <AlertDialogDescription className="text-sm text-foreground">
                {t("Pipelines.deleteStage.description", { count: prompt?.dealCount ?? 0, dealSingular, deals })}
              </AlertDialogDescription>

              <FormSelect
                required
                id="moveToStageId"
                items={items}
                label={t("Pipelines.deleteStage.destinationLabel")}
                placeholder={t("Pipelines.deleteStage.destinationPlaceholder")}
              />
            </AppCardBody>

            <AppCardFooter>
              <AlertDialogCancel disabled={store.isSaving}>{t("Common.actions.cancel")}</AlertDialogCancel>

              <AlertDialogAction
                disabled={!canConfirm}
                variant="destructive"
                onClick={(event) => {
                  event.preventDefault();
                  runUserAction(() => store.confirmStageDeletion(form.moveToStageId));
                }}
              >
                {t("Pipelines.deleteStage.confirm")}
              </AlertDialogAction>
            </AppCardFooter>
          </AppCard>
        </AppForm>
      </AlertDialogContent>
    </AlertDialog>
  );
});
