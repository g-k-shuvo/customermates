"use client";

import type { AutomationDto } from "@/features/automation/automation.schema";

import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";

import { AutomationTriggerKind } from "@/generated/prisma";

import { AUTOMATION_TRIGGER_ENTITY_TYPES } from "@/features/automation/automation.schema";

import { AutomationModalStore } from "./automation-modal.store";
import { AutomationStepFields } from "./automation-step-fields";

import { AppChip } from "@/components/chip/app-chip";
import { FilterAccordion } from "@/components/data-view/filter-modal/filter-accordion";
import { AppForm } from "@/components/forms/form-context";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormInput } from "@/components/forms/form-input";
import { FormLabel } from "@/components/forms/form-label";
import { FormSelect } from "@/components/forms/form-select";
import { Button } from "@/components/ui/button";
import { AppModal } from "@/components/modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { Label } from "@/components/ui/label";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useChangeFieldLabel } from "@/components/entity-terminology/use-change-field-label";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";

type Props = {
  automation: AutomationDto | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  schedulesEnabled: boolean;
};

export const AutomationModal = observer(({ automation, isOpen, onClose, onSaved, schedulesEnabled }: Props) => {
  const t = useTranslations();
  const rootStore = useRootStore();
  const intlStore = useHydratedIntlStore();
  const { singular } = useEntityTerminology();
  const changeFieldLabel = useChangeFieldLabel();
  const [store] = useState(() => new AutomationModalStore(rootStore));
  const { form } = store;

  useEffect(() => {
    if (!isOpen) return;

    store.open(automation);
    void store.loadFields().catch(reportApplicationError);
  }, [store, automation, isOpen]);

  const save = () =>
    runUserAction(async () => {
      if (await store.save()) onSaved();
    });

  const triggerItems = Object.values(AutomationTriggerKind).map((kind) => ({
    value: kind,
    label: t(`Automations.triggerKinds.${kind}`),
  }));
  const entityItems = AUTOMATION_TRIGGER_ENTITY_TYPES.map((entityType) => ({
    value: entityType,
    label: singular(entityType),
  }));
  const changeItems = store.changeFields.map((field) => ({ key: field }));

  return (
    <AppModal
      open={isOpen}
      size="xl"
      title={automation ? t("Automations.editTitle") : t("Automations.createTitle")}
      onClose={onClose}
    >
      <AppForm store={store}>
        <AppCard>
          <AppCardHeader>
            <h2 className="text-x-lg">{automation ? t("Automations.editTitle") : t("Automations.createTitle")}</h2>
          </AppCardHeader>

          <AppCardBody>
            <FormInput id="name" label={t("Automations.fields.name")} />

            <div className="grid gap-3 sm:grid-cols-2">
              <FormSelect id="triggerKind" items={triggerItems} label={t("Automations.fields.trigger")} />

              {store.isSchedule ? (
                <FormInput
                  description={t("Automations.scheduleHint", { timeZone: intlStore.timeZone })}
                  id="schedule"
                  label={t("Automations.fields.schedule")}
                />
              ) : (
                <FormSelect id="entityType" items={entityItems} label={t("Automations.fields.entityType")} />
              )}
            </div>

            {store.isSchedule && !schedulesEnabled ? (
              <Alert data-automation-schedules-off="">
                <AlertDescription>{t("Automations.schedulesOffNotice")}</AlertDescription>
              </Alert>
            ) : null}

            {store.watchesChanges && changeItems.length > 0 && (
              <div className="space-y-1.5" data-automation-changed-fields="">
                <FormAutocomplete
                  id="changedFields"
                  items={changeItems}
                  label={t("Automations.fields.changedFields")}
                  renderValue={(items) =>
                    items.map((item) => (
                      <AppChip key={item.key}>{changeFieldLabel(item.key, store.customColumns)}</AppChip>
                    ))
                  }
                  selectionMode="multiple"
                >
                  {(item) => <span>{changeFieldLabel(item.key, store.customColumns)}</span>}
                </FormAutocomplete>

                <p className="text-subdued text-xs">{t("Automations.changedFieldsHelp")}</p>
              </div>
            )}

            {!store.isSchedule && store.filterableFields.length > 0 && (
              <div className="space-y-1.5" data-automation-conditions="">
                <FormLabel>{t("Automations.fields.conditions")}</FormLabel>

                <FilterAccordion
                  baseId="conditions"
                  customColumns={store.customColumns}
                  filterableFields={store.filterableFields}
                  filters={form.conditions as never}
                  variant="grouped"
                />

                <p className="text-subdued text-xs">{t("Automations.conditionsHelp")}</p>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>{t("Automations.fields.steps")}</Label>

                <Button size="sm" type="button" variant="secondary" onClick={store.addStep}>
                  <Plus className="size-4" />

                  {t("Automations.addStep")}
                </Button>
              </div>

              {form.steps.map((step, index) => (
                <div key={store.stepKeys[index] ?? index} className="flex items-start gap-2 rounded-md border p-3">
                  <div className="min-w-0 flex-1">
                    <AutomationStepFields
                      entityType={store.isSchedule ? null : form.entityType}
                      options={store.stepOptions}
                      step={step}
                      onChange={(next) => store.setStep(index, next)}
                    />
                  </div>

                  <Button
                    aria-label={t("Automations.removeStep")}
                    disabled={form.steps.length === 1}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                    onClick={() => store.removeStep(index)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </AppCardBody>

          <AppCardFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("Common.actions.cancel")}
            </Button>

            <Button
              disabled={form.name.trim().length === 0 || store.isLoading}
              id="automation-modal-save"
              type="button"
              onClick={save}
            >
              {t("Common.actions.save")}
            </Button>
          </AppCardFooter>
        </AppCard>
      </AppForm>
    </AppModal>
  );
});
