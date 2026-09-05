"use client";

import type { ReactNode } from "react";

import { observer } from "mobx-react-lite";
import { useLocale, useTranslations } from "next-intl";

import { EntityType } from "@/generated/prisma";

import { AppChip } from "@/components/chip/app-chip";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { FormNumberInput } from "@/components/forms/form-number-input";
import { FormOutputField } from "@/components/forms/form-output-field";
import { PageState } from "@/components/page-state/page-state";
import { SettingsFieldSkeleton, SettingsFormSkeleton } from "@/components/forms/settings-form-skeleton";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { terminologyLabelForSentence } from "@/features/entity-terminology/entity-terminology-label.utils";

import { resolveForecastingState } from "./company-forecasting-state";

export const CompanyForecastingSection = observer(() => {
  const locale = useLocale();
  const t = useTranslations();
  const { companySettingsStore: store } = useRootStore();
  const intlStore = useHydratedIntlStore();
  const { plural, singular } = useEntityTerminology();
  const deals = terminologyLabelForSentence(plural(EntityType.deal), locale);
  const services = terminologyLabelForSentence(plural(EntityType.service), locale);

  const state = resolveForecastingState({
    status: store.forecastingRequest,
    hasStages: store.pipelineStages.length > 0,
    hasStageValueSums: store.stageValueSums !== undefined,
  });

  const stageById = new Map(store.pipelineStages.map((stage) => [stage.id, stage]));

  let body: ReactNode;

  switch (state) {
    case "loading":
      body = (
        <PageState
          background={
            <SettingsFormSkeleton className="gap-3">
              <SettingsFieldSkeleton animated short />

              <SettingsFieldSkeleton animated short />
            </SettingsFormSkeleton>
          }
          className="min-h-24"
          label={t("PageState.loading")}
          state="loading"
        />
      );
      break;
    case "error":
      body = (
        <p className="text-xs text-destructive" role="alert">
          {t("Common.errors.generic")}
        </p>
      );
      break;
    case "empty":
      body = null;
      break;
    case "content":
      body = (
        <div className="flex flex-col gap-2">
          <ul className="flex flex-col gap-2">
            {store.form.stageProbabilities.map((stage, index) => {
              const label = stageById.get(stage.stageId)?.name ?? stage.stageId;

              return (
                <li key={stage.stageId} className="flex items-center justify-between gap-3">
                  <AppChip>{label}</AppChip>

                  <FormNumberInput
                    aria-label={label}
                    className="text-right"
                    containerClassName="w-24 shrink-0"
                    endContent="%"
                    id={`stageProbabilities[${index}].probability`}
                    label={null}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      );
      break;
    default: {
      const exhaustive: never = state;
      body = exhaustive;
    }
  }

  return (
    <section data-company-forecasting className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-sm font-medium">{t("CompanySettings.forecasting.weightsTitle")}</h2>

        <p className="text-subdued text-xs">
          {t("CompanySettings.forecasting.description", { deal: singular(EntityType.deal) })}
        </p>
      </div>

      {body}

      {state === "content" && (
        <div className="flex flex-col gap-3">
          <FormOutputField
            help={t("CompanySettings.forecasting.totalPipelineHelp", { deals, services })}
            label={t("CompanySettings.forecasting.totalPipeline")}
          >
            <span className="text-x-md font-mono tabular-nums">
              {intlStore.formatCurrency(store.pipelineTotal, store.form.currency)}
            </span>
          </FormOutputField>

          <FormOutputField
            help={t("CompanySettings.forecasting.currentTotalHelp", { deals, services })}
            label={t("CompanySettings.forecasting.currentTotal")}
          >
            <span className="text-x-md font-mono tabular-nums">
              {intlStore.formatCurrency(store.weightedPipelineTotal, store.form.currency)}
            </span>
          </FormOutputField>

          {store.unweightedPipelineTotal > 0 && (
            <FormOutputField
              help={t("CompanySettings.forecasting.withoutStageHelp", { deals })}
              label={t("CompanySettings.forecasting.withoutStage")}
            >
              <span className="text-x-md text-subdued font-mono tabular-nums">
                {intlStore.formatCurrency(store.unweightedPipelineTotal, store.form.currency)}
              </span>
            </FormOutputField>
          )}
        </div>
      )}
    </section>
  );
});
