import type { ComponentType, ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type TestPipeline = {
  id: string;
  name: string;
  position: number;
  isDefault: boolean;
  archivedAt: Date | null;
  stages: Array<{ id: string; name: string; position: number; probability: number }>;
};

const harness = vi.hoisted(() => ({
  translationCalls: [] as Array<{ key: string; values?: Record<string, unknown> }>,
}));

const store = vi.hoisted(() => ({
  sortedPipelines: [] as TestPipeline[],
  activePipelines: [] as TestPipeline[],
  selectedPipelineId: null as string | null,
  isLoading: false,
  isSaving: false,
  hasLoadError: false,
  load: vi.fn(),
  selectPipeline: vi.fn(),
  renamePipeline: vi.fn(),
  setPipelineDefault: vi.fn(),
  reorderPipelines: vi.fn(),
  createPipeline: vi.fn(),
  deletePipeline: vi.fn(),
}));

vi.mock("mobx-react-lite", () => ({
  observer: <T extends ComponentType<any>>(component: T) => component,
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
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

vi.mock("@/components/chip/app-chip", () => ({
  AppChip: ({ children }: { children: ReactNode }) => createElement("span", { "data-chip": true }, children),
}));

vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({
    plural: (entityType: string) => `${entityType}s`,
    singular: (entityType: string) => entityType,
  }),
}));

vi.mock("@/components/modal/hooks/use-delete-confirmation", () => ({
  useDeleteConfirmation: () => ({ showDeleteConfirmation: vi.fn(), showConfirmation: vi.fn() }),
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ pipelinesStore: store, deleteConfirmationModalStore: { close: vi.fn() } }),
}));

vi.mock("../delete-stage-modal", () => ({ DeleteStageModal: () => null }));
vi.mock("../pipeline-stages-list", () => ({ PipelineStagesList: () => null }));

import { PipelinesSection, resolvePipelinesSectionState } from "../pipelines-section";

function pipeline(overrides: Partial<TestPipeline> & { id: string; name: string }): TestPipeline {
  return {
    position: 0,
    isDefault: false,
    archivedAt: null,
    stages: [],
    ...overrides,
  };
}

const active = pipeline({ id: "sales", name: "Sales", isDefault: true });
const archived = pipeline({ id: "legacy", name: "Legacy", position: 1, archivedAt: new Date(0) });

beforeEach(() => {
  harness.translationCalls.length = 0;
  store.sortedPipelines = [active, archived];
  store.activePipelines = [active];
  store.selectedPipelineId = "sales";
  store.isLoading = false;
  store.isSaving = false;
  store.hasLoadError = false;
});

describe("resolvePipelinesSectionState", () => {
  it("prefers the load error over every other state", () => {
    expect(resolvePipelinesSectionState({ isLoading: true, hasLoadError: true, hasPipelines: true })).toBe("error");
  });

  it("reports loading before any pipeline has arrived", () => {
    expect(resolvePipelinesSectionState({ isLoading: true, hasLoadError: false, hasPipelines: false })).toBe("loading");
  });

  it("separates an empty workspace from a populated one", () => {
    expect(resolvePipelinesSectionState({ isLoading: false, hasLoadError: false, hasPipelines: false })).toBe("empty");
    expect(resolvePipelinesSectionState({ isLoading: false, hasLoadError: false, hasPipelines: true })).toBe("content");
  });
});

describe("PipelinesSection", () => {
  it("hides archived pipelines until they are asked for, and names the rest through the catalog", () => {
    const markup = renderToStaticMarkup(createElement(PipelinesSection));

    expect(markup).toContain('value="Sales"');
    expect(markup).not.toContain('value="Legacy"');
    expect(markup).toContain("Pipelines.showArchived");
    expect(markup).not.toContain("Pipelines.hideArchived");
  });

  it("describes the section with the workspace term for deals", () => {
    renderToStaticMarkup(createElement(PipelinesSection));

    expect(harness.translationCalls).toContainEqual({
      key: "Pipelines.description",
      values: { deals: "deals" },
    });
    expect(harness.translationCalls).toContainEqual({
      key: "Pipelines.pipelineNameLabel",
      values: { name: "Sales" },
    });
  });

  it("surfaces a retryable error state instead of the list", () => {
    store.hasLoadError = true;

    const markup = renderToStaticMarkup(createElement(PipelinesSection));

    expect(markup).toContain("Pipelines.loadErrorTitle");
    expect(markup).toContain("Common.actions.refresh");
    expect(markup).not.toContain('value="Sales"');
  });

  it("offers the empty state when the workspace has no pipeline at all", () => {
    store.sortedPipelines = [];
    store.activePipelines = [];

    const markup = renderToStaticMarkup(createElement(PipelinesSection));

    expect(markup).toContain("Pipelines.emptyTitle");
    expect(markup).toContain("Pipelines.emptyDescription");
  });
});
