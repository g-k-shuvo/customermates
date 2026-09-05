import type { ComponentType, ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  outputs: [] as Array<{ help?: ReactNode; label: string; children: ReactNode }>,
  translationCalls: [] as Array<{ key: string; values?: Record<string, string | number> }>,
}));

const store = vi.hoisted(() => ({
  form: {
    currency: "eur",
    stageProbabilities: [{ stageId: "stage-qualified", probability: 40 }],
  },
  forecastingRequest: "ready",
  pipelineStages: [{ id: "stage-qualified", name: "Qualified", probability: 40 }],
  pipelineTotal: 12_000,
  stageValueSums: { "stage-qualified": { totalValue: 10_000 }, __empty__: { totalValue: 2_000 } },
  unweightedPipelineTotal: 2_000,
  weightedPipelineTotal: 4_000,
}));

vi.mock("mobx-react-lite", () => ({
  observer: <T extends ComponentType<any>>(component: T) => component,
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    harness.translationCalls.push({ key, values });
    return key;
  },
}));

vi.mock("@/components/chip/app-chip", () => ({
  AppChip: ({ children }: { children: ReactNode }) => createElement("span", null, children),
}));
vi.mock("@/components/forms/form-number-input", () => ({ FormNumberInput: () => null }));
vi.mock("@/components/forms/form-output-field", () => ({
  FormOutputField: (props: { help?: ReactNode; label: string; children: ReactNode }) => {
    harness.outputs.push(props);
    return createElement("div", { "data-output": props.label }, props.children);
  },
}));
vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({
    plural: (entityType: string) => `${entityType}s`,
    singular: (entityType: string) => entityType,
  }),
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ companySettingsStore: store }),
}));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({
    formatCurrency: (value: number) => `currency:${value}`,
  }),
}));

import { CompanyForecastingSection } from "../company-forecasting-section";

beforeEach(() => {
  harness.outputs.length = 0;
  harness.translationCalls.length = 0;
});

describe("CompanyForecastingSection computed outputs", () => {
  it("explains every total with its calculation and change path", () => {
    const markup = renderToStaticMarkup(createElement(CompanyForecastingSection));

    expect(markup).toContain("currency:12000");
    expect(markup).toContain("currency:4000");
    expect(markup).toContain("currency:2000");
    expect(harness.outputs.map(({ label }) => label)).toEqual([
      "CompanySettings.forecasting.totalPipeline",
      "CompanySettings.forecasting.currentTotal",
      "CompanySettings.forecasting.withoutStage",
    ]);
    expect(harness.translationCalls).toContainEqual({
      key: "CompanySettings.forecasting.totalPipelineHelp",
      values: { deals: "deals", services: "services" },
    });
    expect(harness.translationCalls).toContainEqual({
      key: "CompanySettings.forecasting.currentTotalHelp",
      values: { deals: "deals", services: "services" },
    });
    expect(harness.translationCalls).toContainEqual({
      key: "CompanySettings.forecasting.withoutStageHelp",
      values: { deals: "deals" },
    });
  });
});
