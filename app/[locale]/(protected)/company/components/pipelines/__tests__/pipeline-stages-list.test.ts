import type { ComponentType, ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type TestStage = {
  id: string;
  name: string;
  position: number;
  probability: number;
  rottingDays: number | null;
  kind: StageKind;
};

const harness = vi.hoisted(() => ({
  numberInputs: [] as Array<{ id: string; value?: number; "aria-label"?: string; placeholder?: string }>,
  translationCalls: [] as Array<{ key: string; values?: Record<string, unknown> }>,
  selects: [] as Array<{ value: string; items: string[] }>,
}));

const store = vi.hoisted(() => ({
  selectedPipeline: null as { id: string; name: string } | null,
  selectedStages: [] as TestStage[],
  isSaving: false,
  createStage: vi.fn(),
  renameStage: vi.fn(),
  setStageProbability: vi.fn(),
  setStageRottingDays: vi.fn(),
  setStageKind: vi.fn(),
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
  FormNumberInput: (props: { id: string; value?: number; "aria-label"?: string; placeholder?: string }) => {
    harness.numberInputs.push(props);
    return createElement("input", {
      id: props.id,
      placeholder: props.placeholder,
      readOnly: true,
      value: props.value ?? "",
    });
  },
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ value, children }: { value: string; children: ReactNode }) => {
    harness.selects.push({ value, items: [] });
    return createElement("div", { "data-select": value }, children);
  },
  SelectContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => {
    const current = harness.selects.at(-1);
    if (current) current.items.push(value);
    return createElement("div", { "data-select-item": value }, children);
  },
  SelectTrigger: ({ children, ...props }: { children: ReactNode; "aria-label"?: string; id?: string }) =>
    createElement("button", { "aria-label": props["aria-label"], id: props.id, type: "button" }, children),
  SelectValue: () => createElement("span", null),
}));

vi.mock("@/components/modal/hooks/use-delete-confirmation", () => ({
  useDeleteConfirmation: () => ({ showDeleteConfirmation: vi.fn(), showConfirmation: vi.fn() }),
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ pipelinesStore: store, deleteConfirmationModalStore: { close: vi.fn() } }),
}));

import { StageKind } from "@/generated/prisma";

import {
  MAX_ROTTING_DAYS,
  PipelineStagesList,
  clampProbability,
  clampRottingDays,
  selectableStageKinds,
} from "../pipeline-stages-list";

beforeEach(() => {
  harness.numberInputs.length = 0;
  harness.translationCalls.length = 0;
  harness.selects.length = 0;
  store.selectedPipeline = { id: "sales", name: "Sales" };
  store.selectedStages = [
    { id: "stage-lead", name: "Lead", position: 0, probability: 10, rottingDays: 14, kind: StageKind.open },
    { id: "stage-won", name: "Won", position: 1, probability: 100, rottingDays: null, kind: StageKind.won },
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

describe("clampRottingDays", () => {
  it("disables rotting for an empty, zero or negative window", () => {
    expect(clampRottingDays(undefined)).toBeNull();
    expect(clampRottingDays(Number.NaN)).toBeNull();
    expect(clampRottingDays(0)).toBeNull();
    expect(clampRottingDays(-3)).toBeNull();
  });

  it("rounds a window to whole days and caps it", () => {
    expect(clampRottingDays(14.4)).toBe(14);
    expect(clampRottingDays(MAX_ROTTING_DAYS + 500)).toBe(MAX_ROTTING_DAYS);
  });
});

describe("selectableStageKinds", () => {
  const lead = { id: "stage-lead", kind: StageKind.open } as never;
  const won = { id: "stage-won", kind: StageKind.won } as never;
  const lost = { id: "stage-lost", kind: StageKind.lost } as never;

  it("offers every kind while no stage holds a terminal one", () => {
    expect(selectableStageKinds([lead], "stage-lead")).toEqual([StageKind.open, StageKind.won, StageKind.lost]);
  });

  it("drops a terminal kind another stage already holds", () => {
    expect(selectableStageKinds([lead, won, lost], "stage-lead")).toEqual([StageKind.open]);
  });

  it("keeps the kind the stage itself holds", () => {
    expect(selectableStageKinds([lead, won, lost], "stage-won")).toEqual([StageKind.open, StageKind.won]);
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
      { id: "pipelineStages[0].rottingDays", value: 14 },
      { id: "pipelineStages[1].probability", value: 100 },
      { id: "pipelineStages[1].rottingDays", value: undefined },
    ]);
    expect(harness.translationCalls).toContainEqual({
      key: "Pipelines.probabilityLabel",
      values: { name: "Lead" },
    });
  });

  it("gives every stage its own rotting window, left empty when rotting is off", () => {
    renderToStaticMarkup(createElement(PipelineStagesList));

    expect(harness.numberInputs.filter(({ id }) => id.endsWith(".rottingDays")).map(({ value }) => value)).toEqual([
      14,
      undefined,
    ]);
    expect(harness.translationCalls).toContainEqual({
      key: "Pipelines.rottingDaysLabel",
      values: { name: "Lead" },
    });
    expect(harness.translationCalls).toContainEqual({ key: "Pipelines.rottingDaysPlaceholder", values: undefined });
  });

  it("titles the list with the selected pipeline and offers a stage to add", () => {
    const markup = renderToStaticMarkup(createElement(PipelineStagesList));

    expect(harness.translationCalls).toContainEqual({
      key: "Pipelines.stagesTitle",
      values: { name: "Sales" },
    });
    expect(markup).toContain("Pipelines.addStage");
  });

  it("gives every stage a kind control showing the kind it currently holds", () => {
    renderToStaticMarkup(createElement(PipelineStagesList));

    expect(harness.selects.map(({ value }) => value)).toEqual([StageKind.open, StageKind.won]);
    expect(harness.translationCalls).toContainEqual({
      key: "Pipelines.stageKindLabel",
      values: { name: "Won" },
    });
  });

  it("hides a terminal kind another stage already holds", () => {
    renderToStaticMarkup(createElement(PipelineStagesList));

    expect(harness.selects[0].items).toEqual([StageKind.open, StageKind.lost]);
    expect(harness.selects[1].items).toEqual([StageKind.open, StageKind.won, StageKind.lost]);
  });

  it("explains an empty pipeline instead of rendering an empty list", () => {
    store.selectedStages = [];

    const markup = renderToStaticMarkup(createElement(PipelineStagesList));

    expect(markup).toContain("Pipelines.noStages");
    expect(harness.numberInputs).toEqual([]);
  });
});
