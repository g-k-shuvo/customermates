import type { ComponentType, ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type TestLostReason = {
  id: string;
  name: string;
  position: number;
  archivedAt: Date | null;
};

const harness = vi.hoisted(() => ({
  translationCalls: [] as Array<{ key: string; values?: Record<string, unknown> }>,
}));

const store = vi.hoisted(() => ({
  sortedLostReasons: [] as TestLostReason[],
  activeLostReasons: [] as TestLostReason[],
  isLoading: false,
  isSaving: false,
  hasLoadError: false,
  canManage: true,
  load: vi.fn(),
  renameLostReason: vi.fn(),
  archiveLostReason: vi.fn(),
  unarchiveLostReason: vi.fn(),
  reorderLostReasons: vi.fn(),
  createLostReason: vi.fn(),
  deleteLostReason: vi.fn(),
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
  useRootStore: () => ({ lostReasonsStore: store, deleteConfirmationModalStore: { close: vi.fn() } }),
}));

import { LostReasonsSection, resolveLostReasonsSectionState } from "../lost-reasons-section";

function lostReason(overrides: Partial<TestLostReason> & { id: string; name: string }): TestLostReason {
  return {
    position: 0,
    archivedAt: null,
    ...overrides,
  };
}

const active = lostReason({ id: "price", name: "Price" });
const archived = lostReason({ id: "timing", name: "Bad timing", position: 1, archivedAt: new Date(0) });

beforeEach(() => {
  harness.translationCalls.length = 0;
  store.sortedLostReasons = [active, archived];
  store.activeLostReasons = [active];
  store.isLoading = false;
  store.isSaving = false;
  store.hasLoadError = false;
  store.canManage = true;
});

describe("resolveLostReasonsSectionState", () => {
  it("prefers the load error over every other state", () => {
    expect(resolveLostReasonsSectionState({ isLoading: true, hasLoadError: true, hasLostReasons: true })).toBe("error");
  });

  it("reports loading before any reason has arrived", () => {
    expect(resolveLostReasonsSectionState({ isLoading: true, hasLoadError: false, hasLostReasons: false })).toBe(
      "loading",
    );
  });

  it("separates an empty workspace from a populated one", () => {
    expect(resolveLostReasonsSectionState({ isLoading: false, hasLoadError: false, hasLostReasons: false })).toBe(
      "empty",
    );
    expect(resolveLostReasonsSectionState({ isLoading: false, hasLoadError: false, hasLostReasons: true })).toBe(
      "content",
    );
  });
});

describe("LostReasonsSection", () => {
  it("hides archived reasons until they are asked for", () => {
    const markup = renderToStaticMarkup(createElement(LostReasonsSection));

    expect(markup).toContain('value="Price"');
    expect(markup).not.toContain('value="Bad timing"');
    expect(markup).toContain("LostReasons.showArchived");
    expect(markup).not.toContain("LostReasons.hideArchived");
  });

  it("describes the section with the workspace term for deals", () => {
    renderToStaticMarkup(createElement(LostReasonsSection));

    expect(harness.translationCalls).toContainEqual({
      key: "LostReasons.description",
      values: { deals: "deals" },
    });
    expect(harness.translationCalls).toContainEqual({
      key: "LostReasons.lostReasonNameLabel",
      values: { name: "Price" },
    });
  });

  it("surfaces a retryable error state instead of the list", () => {
    store.hasLoadError = true;

    const markup = renderToStaticMarkup(createElement(LostReasonsSection));

    expect(markup).toContain("LostReasons.loadErrorTitle");
    expect(markup).toContain("Common.actions.refresh");
    expect(markup).not.toContain('value="Price"');
  });

  it("offers the empty state when the workspace has no reason at all", () => {
    store.sortedLostReasons = [];
    store.activeLostReasons = [];

    const markup = renderToStaticMarkup(createElement(LostReasonsSection));

    expect(markup).toContain("LostReasons.emptyTitle");
    expect(markup).toContain("LostReasons.emptyDescription");
  });

  it("locks every control for a member who cannot manage the workspace", () => {
    store.canManage = false;

    const markup = renderToStaticMarkup(createElement(LostReasonsSection));

    expect(markup).toContain("disabled");
  });
});
