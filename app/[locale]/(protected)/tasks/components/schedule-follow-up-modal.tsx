"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { ACTIVITY_KIND_VALUES, activityKindLabelKey } from "@/components/activity/activity-kind.config";
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
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";

export const ScheduleFollowUpModal = observer(function ScheduleFollowUpModal() {
  const t = useTranslations();
  const { activityCompletionStore: store } = useRootStore();

  const isOpen = store.isPromptOpen;
  const focusReturn = useOverlayFocusReturn(isOpen);
  const kindItems = ACTIVITY_KIND_VALUES.map((kind) => ({ value: kind, label: t(activityKindLabelKey(kind)) }));

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) store.closePrompt();
      }}
    >
      <AlertDialogContent className="flex flex-col gap-0 border-0 bg-transparent p-0 shadow-none" {...focusReturn}>
        <AppForm store={store}>
          <AppCard>
            <AppCardHeader>
              <AlertDialogTitle className="text-base font-semibold">{t("Activities.followUp.title")}</AlertDialogTitle>
            </AppCardHeader>

            <AppCardBody>
              <AlertDialogDescription className="text-sm text-foreground">
                {t("Activities.followUp.description", { name: store.target?.name ?? "" })}
              </AlertDialogDescription>

              <FormInput autoFocus required id="name" label={t("Activities.followUp.nameLabel")} />

              <FormSelect
                id="activityKind"
                items={kindItems}
                label={t("Activities.fields.activityKind")}
                placeholder={t("Common.activityKinds.unspecified")}
              />

              <FormIsoDatePicker
                required
                dateOnly={false}
                displayFormat="descriptiveShort"
                id="dueAt"
                label={t("Activities.fields.dueAt")}
              />

              <FormNumberInput
                id="durationMinutes"
                label={t("Activities.fields.durationMinutes")}
                placeholder={t("Activities.followUp.durationPlaceholder")}
              />
            </AppCardBody>

            <AppCardFooter>
              <AlertDialogCancel disabled={store.isLoading}>{t("Common.actions.cancel")}</AlertDialogCancel>

              <AlertDialogAction
                disabled={store.isLoading}
                variant="secondary"
                onClick={(event) => {
                  event.preventDefault();
                  runUserAction(() => store.skipFollowUp());
                }}
              >
                {t("Activities.followUp.skip")}
              </AlertDialogAction>

              <AlertDialogAction
                disabled={!store.canSubmitFollowUp}
                onClick={(event) => {
                  event.preventDefault();
                  runUserAction(() => store.confirmFollowUp());
                }}
              >
                {t("Activities.followUp.schedule")}
              </AlertDialogAction>
            </AppCardFooter>
          </AppCard>
        </AppForm>
      </AlertDialogContent>
    </AlertDialog>
  );
});
