import type { ComponentType, ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type TestStage = { id: string; name: string; position: number; probability: number };

const harness = vi.hoisted(() => ({
  numberInputs: [] as Array<{ id: string; value?: number; "aria-label"?: string }>,
  translationCalls: [] as Array<{ key: string; values?: Record<string, unknown> }>,
}));

const store = vi.hoisted(() => ({
  selectedPipeline: null as { id: string; name: string } | null,
  selectedStages: [] as TestStage[],
  isSaving: false,
  createStage: vi.fn(),
  renameStage: vi.fn(),
  setStageProbability: vi.fn(),
  reorderStages: vi.fn(),
  deleteStage: vi.fn(),
}));

vi.mock("mobx-react-lite", () => ({
  observer: <T extends ComponentType<any>>(component: T) => component,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    harness.translationCalls.push({ key, values });
    return key;
  },
}));

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: ReactNode }) => createElement("div", { "data-dnd": true }, children),
  KeyboardSensor: "keyboard",
  PointerSensor: "pointer",
  useSensor: () => ({}),
  useSensors: () => [],
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: ReactNode }) => createElement("div", { "data-sortable": true }, children),
  arrayMove: (items: string[]) => items,
  sortableKeyboardCoordinates: () => undefined,
  useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => undefined, transform: null }),
  verticalListSortingStrategy: "vertical",
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => undefined } },
}));

vi.mock("@/components/forms/form-number-input", () => ({
  FormNumberInput: (props: { id: string; value?: number; "aria-label"?: string }) => {
    harness.numberInputs.push(props);
    return createElement("input", { id: props.id, readOnly: true, value: props.value ?? "" });
  },
}));

vi.mock("@/components/modal/hooks/use-delete-confirmation", () => ({
  useDeleteConfirmation: () => ({ showDeleteConfirmation: vi.fn(), showConfirmation: vi.fn() }),
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ pipelinesStore: store, deleteConfirmationModalStore: { close: vi.fn() } }),
}));

import { PipelineStagesList, clampProbability } from "../pipeline-stages-list";

beforeEach(() => {
  harness.numberInputs.length = 0;
  harness.translationCalls.length = 0;
  store.selectedPipeline = { id: "sales", name: "Sales" };
  store.selectedStages = [
    { id: "stage-lead", name: "Lead", position: 0, probability: 10 },
    { id: "stage-won", name: "Won", position: 1, probability: 100 },
  ];
  store.isSaving = false;
});

describe("clampProbability", () => {
  it("keeps a probability inside the zero to one hundred range", () => {
    expect(clampProbability(-20, 10)).toBe(0);
    expect(clampProbability(140, 10)).toBe(100);
    expect(clampProbability(42.4, 10)).toBe(42);
  });

  it("falls back to the stored probability when the field is cleared", () => {
    expect(clampProbability(undefined, 30)).toBe(30);
    expect(clampProbability(Number.NaN, 30)).toBe(30);
  });
});

describe("PipelineStagesList", () => {
  it("renders nothing until a pipeline is selected", () => {
    store.selectedPipeline = null;

    expect(renderToStaticMarkup(createElement(PipelineStagesList))).toBe("");
  });

  it("gives every stage a rename field and its own probability input", () => {
    const markup = renderToStaticMarkup(createElement(PipelineStagesList));

    expect(markup).toContain('value="Lead"');
    expect(markup).toContain('value="Won"');
    expect(harness.numberInputs.map(({ id, value }) => ({ id, value }))).toEqual([
      { id: "pipelineStages[0].probability", value: 10 },
      { id: "pipelineStages[1].probability", value: 100 },
    ]);
    expect(harness.translationCalls).toContainEqual({
      key: "Pipelines.probabilityLabel",
      values: { name: "Lead" },
    });
  });

  it("titles the list with the selected pipeline and offers a stage to add", () => {
    const markup = renderToStaticMarkup(createElement(PipelineStagesList));

    expect(harness.translationCalls).toContainEqual({
      key: "Pipelines.stagesTitle",
      values: { name: "Sales" },
    });
    expect(markup).toContain("Pipelines.addStage");
  });

  it("explains an empty pipeline instead of rendering an empty list", () => {
    store.selectedStages = [];

    const markup = renderToStaticMarkup(createElement(PipelineStagesList));

    expect(markup).toContain("Pipelines.noStages");
    expect(harness.numberInputs).toEqual([]);
  });
});
