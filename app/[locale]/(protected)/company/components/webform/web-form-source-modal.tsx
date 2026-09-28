"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { KeyRound, Plus, Trash2 } from "lucide-react";

import { AppModal } from "@/components/modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormInputChips } from "@/components/forms/form-input-chips";
import { FormCheckbox } from "@/components/forms/form-checkbox";
import { FormSelect } from "@/components/forms/form-select";
import { Button } from "@/components/ui/button";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { FormActions } from "@/components/card/form-actions";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";

export const WebFormSourceModal = observer(() => {
  const t = useTranslations();
  const { webFormSourceModalStore } = useRootStore();
  const { form, canManage, isDisabled, isEditing, revealedSecret, mappableColumns } = webFormSourceModalStore;
  const { showDeleteConfirmation } = useDeleteConfirmation();
  const { singular } = useEntityTerminology();
  const columnItems = mappableColumns.map((column) => ({
    value: column.id,
    label: t("WebFormSourceModal.customFieldColumnOption", {
      entity: singular(column.entityType),
      column: column.label,
    }),
  }));
  const customFields = form.fieldMapping.customFields ?? [];

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

            <div className="flex flex-col gap-1">
              <FormCheckbox id="dedupeLeads" label={t("WebFormSourceModal.dedupeLeads")} />

              <p className="text-xs text-muted-foreground">{t("WebFormSourceModal.dedupeLeadsHelp")}</p>
            </div>

            <FormCheckbox id="active" label={t("WebFormSourceModal.active")} />

            <AppCardHeader>
              <h3 className="truncate text-sm">{t("WebFormSourceModal.mappingTitle")}</h3>
            </AppCardHeader>

            <p className="text-subdued text-xs">{t("WebFormSourceModal.mappingDescription")}</p>

            <FormInput id="fieldMapping.firstName" label={t("Common.table.columns.firstName")} />

            <FormInput id="fieldMapping.lastName" label={t("Common.table.columns.lastName")} />

            <FormInput id="fieldMapping.email" label={t("Common.inputs.email")} />

            <FormInput id="fieldMapping.organizationName" label={t("Common.table.columns.organization")} />

            <FormInput id="fieldMapping.message" label={t("WebFormSourceModal.message")} />

            <FormInput id="fieldMapping.value" label={t("WebFormSourceModal.value")} />

            <div data-web-form-custom-fields className="space-y-2">
              <h3 className="text-sm font-medium">{t("WebFormSourceModal.customFieldsTitle")}</h3>

              <p className="text-subdued text-xs">{t("WebFormSourceModal.customFieldsDescription")}</p>

              {customFields.map((_row, index) => (
                <div
                  key={index}
                  className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2"
                  data-web-form-custom-field={index}
                >
                  <FormInput
                    id={`fieldMapping.customFields[${index}].path`}
                    label={t("WebFormSourceModal.customFieldPath", { number: index + 1 })}
                  />

                  <FormSelect
                    id={`fieldMapping.customFields[${index}].columnId`}
                    items={columnItems}
                    label={t("WebFormSourceModal.customFieldColumn", { number: index + 1 })}
                    placeholder={t("WebFormSourceModal.customFieldColumnPlaceholder")}
                  />

                  <Button
                    aria-label={t("WebFormSourceModal.removeCustomField", { number: index + 1 })}
                    disabled={isDisabled}
                    size="icon"
                    type="button"
                    variant="ghost"
                    onClick={() => webFormSourceModalStore.removeCustomField(index)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}

              <Button
                disabled={isDisabled}
                size="sm"
                type="button"
                variant="secondary"
                onClick={webFormSourceModalStore.addCustomField}
              >
                <Plus className="size-4" />

                {t("WebFormSourceModal.addCustomField")}
              </Button>
            </div>

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
