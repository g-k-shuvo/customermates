"use client";

import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { useTranslations } from "next-intl";

import { EntityDetailField } from "@/components/entity-detail/entity-detail-field";
import { EntityDetailFieldActions } from "@/components/entity-detail/entity-detail-field-actions";
import { FormSelect } from "@/components/forms/form-select";
import { useRootStore } from "@/core/stores/root-store.provider";
import { reportApplicationError } from "@/core/errors/report-application-error";

import { DEAL_DETAIL_FIELD } from "./deal-detail-personalization";

type Props = {
  showFieldActions?: boolean;
};

export const DealPipelineFields = observer(function DealPipelineFields({ showFieldActions = false }: Props) {
  const t = useTranslations();
  const { dealDetailStore, dealsStore } = useRootStore();

  useEffect(() => {
    void dealsStore.ensurePipelinesLoaded().then(dealDetailStore.applyDefaultPipeline).catch(reportApplicationError);
  }, [dealDetailStore, dealsStore]);

  const pipelineLabel = t("DealModal.pipeline.label");
  const stageLabel = t("DealModal.pipeline.stageLabel");
  const selectedPipelineId = dealDetailStore.form.pipelineId;

  const pipelineItems = dealDetailStore.pipelineOptions.map((pipeline) => ({
    value: pipeline.id,
    label: pipeline.isArchived ? t("DealModal.pipeline.archivedOption", { name: pipeline.name }) : pipeline.name,
    disabled: pipeline.isArchived && pipeline.id !== selectedPipelineId,
  }));

  const stageItems = dealDetailStore.stageOptions.map((stage) => ({ value: stage.id, label: stage.name }));

  return (
    <>
      <EntityDetailField fieldId={DEAL_DETAIL_FIELD.pipelineId}>
        <FormSelect
          id="pipelineId"
          items={pipelineItems}
          label={pipelineLabel}
          labelEndAddon={
            showFieldActions ? (
              <EntityDetailFieldActions fieldId={DEAL_DETAIL_FIELD.pipelineId} label={pipelineLabel} />
            ) : undefined
          }
          placeholder={t("DealModal.pipeline.placeholder")}
          onValueChange={dealDetailStore.selectPipeline}
        />
      </EntityDetailField>

      <EntityDetailField fieldId={DEAL_DETAIL_FIELD.stageId}>
        <FormSelect
          id="stageId"
          items={stageItems}
          label={stageLabel}
          labelEndAddon={
            showFieldActions ? (
              <EntityDetailFieldActions fieldId={DEAL_DETAIL_FIELD.stageId} label={stageLabel} />
            ) : undefined
          }
          placeholder={t("DealModal.pipeline.stagePlaceholder")}
          onValueChange={dealDetailStore.selectStage}
        />
      </EntityDetailField>
    </>
  );
});
