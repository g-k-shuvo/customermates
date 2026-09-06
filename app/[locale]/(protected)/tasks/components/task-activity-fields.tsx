"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { ACTIVITY_KIND_VALUES, activityKindLabelKey } from "@/components/activity/activity-kind.config";
import { EntityDetailField } from "@/components/entity-detail/entity-detail-field";
import { EntityDetailFieldActions } from "@/components/entity-detail/entity-detail-field-actions";
import { FormIsoDatePicker } from "@/components/forms/form-iso-date-picker";
import { FormNumberInput } from "@/components/forms/form-number-input";
import { FormOutputField } from "@/components/forms/form-output-field";
import { FormSelect } from "@/components/forms/form-select";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { ActivityCompleteToggle } from "./activity-complete-toggle";
import { TASK_DETAIL_FIELD } from "./task-detail-personalization";

type Props = {
  showFieldActions?: boolean;
};

export const TaskActivityFields = observer(function TaskActivityFields({ showFieldActions = false }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { taskDetailStore } = useRootStore();
  const { fetchedEntity, form, isCustomTask } = taskDetailStore;

  if (form.id !== undefined && !isCustomTask) return null;

  const kindLabel = t("Activities.fields.activityKind");
  const dueLabel = t("Activities.fields.dueAt");
  const durationLabel = t("Activities.fields.durationMinutes");
  const statusLabel = t("Activities.fields.completion");
  const kindItems = ACTIVITY_KIND_VALUES.map((kind) => ({ value: kind, label: t(activityKindLabelKey(kind)) }));

  return (
    <>
      <EntityDetailField fieldId={TASK_DETAIL_FIELD.activityKind}>
        <FormSelect
          id="activityKind"
          items={kindItems}
          label={kindLabel}
          labelEndAddon={
            showFieldActions ? (
              <EntityDetailFieldActions fieldId={TASK_DETAIL_FIELD.activityKind} label={kindLabel} />
            ) : undefined
          }
          placeholder={t("Common.activityKinds.unspecified")}
        />
      </EntityDetailField>

      <EntityDetailField fieldId={TASK_DETAIL_FIELD.dueAt}>
        <FormIsoDatePicker dateOnly={false} displayFormat="descriptiveShort" id="dueAt" label={dueLabel} />
      </EntityDetailField>

      <EntityDetailField fieldId={TASK_DETAIL_FIELD.durationMinutes}>
        <FormNumberInput
          id="durationMinutes"
          label={durationLabel}
          labelEndAddon={
            showFieldActions ? (
              <EntityDetailFieldActions fieldId={TASK_DETAIL_FIELD.durationMinutes} label={durationLabel} />
            ) : undefined
          }
        />
      </EntityDetailField>

      {fetchedEntity && isCustomTask && (
        <EntityDetailField fieldId={TASK_DETAIL_FIELD.completedAt}>
          <FormOutputField
            label={statusLabel}
            labelEndAddon={
              showFieldActions ? (
                <EntityDetailFieldActions fieldId={TASK_DETAIL_FIELD.completedAt} label={statusLabel} />
              ) : undefined
            }
            outputClassName="h-auto min-h-9 py-1.5"
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span suppressHydrationWarning className="truncate text-sm">
                {fetchedEntity.completedAt
                  ? t("Activities.completion.completedAt", {
                      date: intlStore.formatDescriptiveShortDateTime(fetchedEntity.completedAt),
                    })
                  : t("Activities.completion.open")}
              </span>

              <ActivityCompleteToggle
                activity={{
                  id: fetchedEntity.id,
                  name: fetchedEntity.name,
                  activityKind: fetchedEntity.activityKind,
                  dueAt: fetchedEntity.dueAt,
                  completedAt: fetchedEntity.completedAt,
                  hasLinkedRecords:
                    fetchedEntity.contacts.length + fetchedEntity.organizations.length + fetchedEntity.deals.length > 0,
                }}
                layout="button"
              />
            </span>
          </FormOutputField>
        </EntityDetailField>
      )}
    </>
  );
});
