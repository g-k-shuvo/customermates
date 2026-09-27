"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { EntityType } from "@/generated/prisma";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormIsoDatePicker } from "@/components/forms/form-iso-date-picker";
import { FormNumberInput } from "@/components/forms/form-number-input";
import { FormSelect } from "@/components/forms/form-select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useOverlayFocusReturn } from "@/components/ui/use-overlay-focus-return";
import { useOpenEntity } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { useColumnLabel } from "@/components/entity-terminology/use-column-label";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";

export const LeadConvertModal = observer(function LeadConvertModal() {
  const t = useTranslations();
  const { leadConvertStore: store } = useRootStore();
  const openEntity = useOpenEntity();
  const columnLabel = useColumnLabel();

  const isOpen = store.isOpen;
  const focusReturn = useOverlayFocusReturn(isOpen);
  const pipelineItems = store.pipelineOptions.map((pipeline) => ({ value: pipeline.id, label: pipeline.name }));
  const stageItems = store.stageOptions.map((stage) => ({ value: stage.id, label: stage.name }));
  const stageProbability = store.selectedStage?.probability;
  const loadingPlaceholder = store.isLoadingPlacement ? t("Loading.text") : undefined;

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) store.close();
      }}
    >
      <AlertDialogContent className="flex flex-col gap-0 border-0 bg-transparent p-0 shadow-none" {...focusReturn}>
        <AppForm store={store}>
          <AppCard>
            <AppCardHeader>
              <AlertDialogTitle className="text-base font-semibold">{t("LeadDetail.convert")}</AlertDialogTitle>
            </AppCardHeader>

            <AppCardBody>
              <AlertDialogDescription className="text-sm text-foreground">
                {t("LeadDetail.convertDescription", { title: store.targetLead?.title ?? "" })}
              </AlertDialogDescription>

              <FormInput autoFocus required id="name" label={columnLabel("name")} />

              <FormNumberInput id="baseValue" label={columnLabel("baseValue")} />

              {store.canChoosePlacement && (
                <>
                  <FormSelect
                    id="pipelineId"
                    items={pipelineItems}
                    label={t("DealModal.pipeline.label")}
                    optionsLoading={store.isLoadingPlacement}
                    placeholder={loadingPlaceholder ?? t("DealModal.pipeline.placeholder")}
                    onValueChange={store.selectPipeline}
                  />

                  <FormSelect
                    id="stageId"
                    items={stageItems}
                    label={t("DealModal.pipeline.stageLabel")}
                    optionsLoading={store.isLoadingPlacement}
                    placeholder={loadingPlaceholder ?? t("DealModal.pipeline.stagePlaceholder")}
                    onValueChange={store.selectStage}
                  />
                </>
              )}

              <FormIsoDatePicker id="expectedCloseDate" label={t("DealModal.expectedCloseDateLabel")} />

              <FormNumberInput
                id="probability"
                label={t("Common.probability")}
                placeholder={
                  stageProbability === undefined
                    ? undefined
                    : t("LeadDetail.probabilityPlaceholder", { percent: stageProbability })
                }
              />
            </AppCardBody>

            <AppCardFooter>
              <AlertDialogCancel disabled={store.isSubmitting}>{t("Common.actions.cancel")}</AlertDialogCancel>

              <AlertDialogAction
                disabled={!store.canSubmit}
                onClick={(event) => {
                  event.preventDefault();
                  runUserAction(async () => {
                    const dealId = await store.confirm();
                    if (dealId) openEntity(EntityType.deal, dealId);
                  });
                }}
              >
                {t("LeadDetail.convert")}
              </AlertDialogAction>
            </AppCardFooter>
          </AppCard>
        </AppForm>
      </AlertDialogContent>
    </AlertDialog>
  );
});
