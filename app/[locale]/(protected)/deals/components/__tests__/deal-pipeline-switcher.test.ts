import type { ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type PipelineOption = { id: string; name: string; isDefault: boolean; isArchived: boolean };

const harness = vi.hoisted(() => ({
  valueChanges: [] as Array<(next: string) => void>,
  options: [] as string[],
}));

const dealsStore = vi.hoisted(() => ({
  isReady: true,
  pipelines: [] as Array<{ id: string; name: string; isDefault: boolean; isArchived: boolean }>,
  selectedPipelineId: null as string | null,
  selectPipeline: vi.fn(),
}));

vi.mock("mobx-react-lite", () => ({ observer: <T>(component: T) => component }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key,
}));

vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => ({ dealsStore }) }));

vi.mock("@/components/ui/select", () => ({
  Select: (props: { children: ReactNode; onValueChange: (next: string) => void; value: string }) => {
    harness.valueChanges.push(props.onValueChange);
    return createElement("div", { "data-select-value": props.value }, props.children);
  },
  SelectContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => {
    harness.options.push(value);
    return createElement("div", { "data-option": value }, children);
  },
  SelectTrigger: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  SelectValue: () => createElement("span", null),
}));

import { ALL_PIPELINES_VALUE, DealPipelineSwitcher } from "../deal-pipeline-switcher";

const NEW_PIPELINE = "10000000-0000-4000-8000-000000000001";
const RENEWALS = "10000000-0000-4000-8000-000000000002";
const RETIRED = "10000000-0000-4000-8000-000000000003";

const newBusiness: PipelineOption = { id: NEW_PIPELINE, name: "New business", isDefault: true, isArchived: false };
const renewals: PipelineOption = { id: RENEWALS, name: "Renewals", isDefault: false, isArchived: false };
const retired: PipelineOption = { id: RETIRED, name: "Retired", isDefault: false, isArchived: true };

function render() {
  return renderToStaticMarkup(createElement(DealPipelineSwitcher));
}

beforeEach(() => {
  harness.valueChanges.length = 0;
  harness.options.length = 0;
  dealsStore.isReady = true;
  dealsStore.selectedPipelineId = null;
  dealsStore.selectPipeline.mockReset();
  dealsStore.pipelines = [newBusiness, renewals];
});

describe("DealPipelineSwitcher", () => {
  it("stays out of the way until there is a second pipeline to switch to", () => {
    dealsStore.pipelines = [newBusiness];

    expect(render()).toBe("");

    dealsStore.pipelines = [];

    expect(render()).toBe("");
  });

  it("waits for the board to report before offering a selection", () => {
    dealsStore.isReady = false;

    expect(render()).toBe("");
  });

  it("offers every live pipeline alongside the unfiltered board", () => {
    const markup = render();

    expect(harness.options).toEqual([ALL_PIPELINES_VALUE, NEW_PIPELINE, RENEWALS]);
    expect(markup).toContain("New business");
    expect(markup).toContain("Renewals");
    expect(markup).toContain("DealModal.pipeline.allPipelines");
  });

  it("hides an archived pipeline unless it is the one being looked at", () => {
    dealsStore.pipelines = [newBusiness, renewals, retired];

    render();
    expect(harness.options).not.toContain(RETIRED);

    harness.options.length = 0;
    dealsStore.selectedPipelineId = RETIRED;
    const markup = render();

    expect(harness.options).toContain(RETIRED);
    expect(markup).toContain("DealModal.pipeline.archivedOption:Retired");
  });

  it("reflects the pipeline the current filters select", () => {
    dealsStore.selectedPipelineId = RENEWALS;

    expect(render()).toContain(`data-select-value="${RENEWALS}"`);
  });

  it("sets the pipeline through the store", () => {
    render();
    harness.valueChanges.at(-1)?.(RENEWALS);

    expect(dealsStore.selectPipeline).toHaveBeenCalledWith(RENEWALS);
  });

  it("clears the pipeline when the unfiltered board is chosen", () => {
    dealsStore.selectedPipelineId = RENEWALS;
    render();
    harness.valueChanges.at(-1)?.(ALL_PIPELINES_VALUE);

    expect(dealsStore.selectPipeline).toHaveBeenCalledWith(null);
  });
});
