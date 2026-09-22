"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { KeyRound, Trash2 } from "lucide-react";

import { AppModal } from "@/components/modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormInputChips } from "@/components/forms/form-input-chips";
import { FormCheckbox } from "@/components/forms/form-checkbox";
import { FormActions } from "@/components/card/form-actions";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";

export const WebFormSourceModal = observer(() => {
  const t = useTranslations();
  const { webFormSourceModalStore } = useRootStore();
  const { form, canManage, isDisabled, isEditing, revealedSecret } = webFormSourceModalStore;
  const { showDeleteConfirmation } = useDeleteConfirmation();

  return (
    <AppModal
      actions={
        form?.id && canManage
          ? [
              {
                id: "rotate-web-form-secret",
                label: t("WebFormSourceModal.rotateSecret"),
                icon: KeyRound,
                disabled: isDisabled,
                onClick: () => runUserAction(() => webFormSourceModalStore.rotateSecret()),
              },
              {
                id: "delete-web-form-source",
                label: t("Common.actions.delete"),
                icon: Trash2,
                variant: "destructive",
                disabled: isDisabled,
                onClick: () => showDeleteConfirmation(() => webFormSourceModalStore.delete()),
              },
            ]
          : []
      }
      store={webFormSourceModalStore}
      title={t("WebFormSourceModal.title")}
    >
      <AppForm store={webFormSourceModalStore}>
        <AppCard>
          <AppCardHeader>
            <h2 className="truncate text-x-lg">{t("WebFormSourceModal.title")}</h2>
          </AppCardHeader>

          <AppCardBody>
            <FormInput required id="name" label={t("Common.inputs.name")} />

            <div className="space-y-1.5">
              <FormInput required disabled={isEditing} id="slug" label={t("WebFormSourceModal.slug")} />

              <p className="text-subdued text-xs">
                {isEditing ? t("WebFormSourceModal.slugImmutable") : t("WebFormSourceModal.slugDescription")}
              </p>
            </div>

            <FormInputChips arrayMode id="defaultLabels" label={t("WebFormSourceModal.defaultLabels")} />

            <FormCheckbox id="active" label={t("WebFormSourceModal.active")} />

            <AppCardHeader>
              <h3 className="truncate text-sm">{t("WebFormSourceModal.mappingTitle")}</h3>
            </AppCardHeader>

            <p className="text-subdued text-xs">{t("WebFormSourceModal.mappingDescription")}</p>

            <FormInput id="fieldMapping.firstName" label={t("Common.table.columns.firstName")} />

            <FormInput id="fieldMapping.lastName" label={t("Common.table.columns.lastName")} />

            <FormInput id="fieldMapping.email" label={t("Common.inputs.email")} />

            <FormInput id="fieldMapping.phone" label={t("WebFormSourceModal.phone")} />

            <FormInput id="fieldMapping.organizationName" label={t("Common.table.columns.organization")} />

            <FormInput id="fieldMapping.message" label={t("WebFormSourceModal.message")} />

            <div className="space-y-1.5">
              <FormInput id="fieldMapping.titleTemplate" label={t("WebFormSourceModal.titleTemplate")} />

              <p className="text-subdued text-xs">{t("WebFormSourceModal.titleTemplateDescription")}</p>
            </div>

            {revealedSecret ? (
              <div className="space-y-1.5 rounded-md border border-warning/40 bg-warning/5 p-3">
                <p className="text-sm font-medium">{t("WebFormSourceModal.secretRevealedTitle")}</p>

                <p className="text-subdued text-xs">{t("WebFormSourceModal.secretRevealedDescription")}</p>

                <code className="block select-text break-all rounded bg-input-background px-2 py-1 font-mono text-xs">
                  {revealedSecret}
                </code>
              </div>
            ) : null}
          </AppCardBody>

          <FormActions showInitially anchorScope="web-form-source-modal" store={webFormSourceModalStore} />
        </AppCard>
      </AppForm>
    </AppModal>
  );
});
