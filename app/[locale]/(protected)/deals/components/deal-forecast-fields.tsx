"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { EntityDetailField } from "@/components/entity-detail/entity-detail-field";
import { EntityDetailFieldActions } from "@/components/entity-detail/entity-detail-field-actions";
import { EntityDetailFieldDragHandle } from "@/components/entity-detail/entity-detail-fields";
import { FormIsoDatePicker } from "@/components/forms/form-iso-date-picker";
import { FormNumberInput } from "@/components/forms/form-number-input";
import { useRootStore } from "@/core/stores/root-store.provider";

import { DEAL_DETAIL_FIELD } from "./deal-detail-personalization";

type Props = {
  field: typeof DEAL_DETAIL_FIELD.expectedCloseDate | typeof DEAL_DETAIL_FIELD.probability;
  showFieldActions?: boolean;
};

export const DealForecastField = observer(function DealForecastField({ field, showFieldActions = false }: Props) {
  const t = useTranslations();
  const { dealDetailStore } = useRootStore();

  if (field === DEAL_DETAIL_FIELD.expectedCloseDate) {
    const label = t("DealModal.expectedCloseDateLabel");

    return (
      <EntityDetailField fieldId={field}>
        <FormIsoDatePicker
          id="expectedCloseDate"
          label={label}
          value={
            dealDetailStore.form.expectedCloseDate
              ? new Date(dealDetailStore.form.expectedCloseDate).toISOString()
              : undefined
          }
          onValueChange={(value) => dealDetailStore.onChange("expectedCloseDate", value ? new Date(value) : undefined)}
        />
      </EntityDetailField>
    );
  }

  const label = t("Common.probability");
  const stageProbability = dealDetailStore.stageOptions.find(
    (stage) => stage.id === dealDetailStore.form.stageId,
  )?.probability;

  return (
    <EntityDetailField fieldId={field}>
      <FormNumberInput
        controlStartAddon={showFieldActions ? <EntityDetailFieldDragHandle label={label} /> : undefined}
        id="probability"
        label={label}
        labelEndAddon={showFieldActions ? <EntityDetailFieldActions fieldId={field} label={label} /> : undefined}
        placeholder={
          stageProbability === undefined
            ? undefined
            : t("LeadDetail.probabilityPlaceholder", { percent: stageProbability })
        }
      />
    </EntityDetailField>
  );
});
