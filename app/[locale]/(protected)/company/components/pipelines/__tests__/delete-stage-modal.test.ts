import type { ComponentType, ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type SelectItem = { value: string; label: string };

const harness = vi.hoisted(() => ({
  selects: [] as Array<{ id: string; items?: SelectItem[]; label?: string; placeholder?: string }>,
  actions: [] as Array<{ disabled?: boolean }>,
  translationCalls: [] as Array<{ key: string; values?: Record<string, unknown> }>,
}));

const store = vi.hoisted(() => ({
  stageDeletionPrompt: null as { stageId: string; pipelineId: string | null; dealCount: number } | null,
  stageDeletionTargets: [] as Array<{ id: string; name: string }>,
  isSaving: false,
  cancelStageDeletion: vi.fn(),
  confirmStageDeletion: vi.fn(),
}));

const form = vi.hoisted(() => ({
  form: { moveToStageId: "" },
  moveToStageId: "",
  resetDestination: vi.fn(),
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

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? createElement("div", { "data-alert-dialog": true }, children) : null,
  AlertDialogAction: (props: { disabled?: boolean; children: ReactNode }) => {
    harness.actions.push({ disabled: props.disabled });
    return createElement("button", { disabled: props.disabled, type: "button" }, props.children);
  },
  AlertDialogCancel: ({ children }: { children: ReactNode }) => createElement("button", { type: "button" }, children),
  AlertDialogContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  AlertDialogDescription: ({ children }: { children: ReactNode }) => createElement("p", null, children),
  AlertDialogTitle: ({ children }: { children: ReactNode }) => createElement("h2", null, children),
}));

vi.mock("@/components/forms/form-context", () => ({
  AppForm: ({ children }: { children: ReactNode }) => createElement("div", { "data-app-form": true }, children),
}));

vi.mock("@/components/forms/form-select", () => ({
  FormSelect: (props: { id: string; items?: SelectItem[]; label?: string; placeholder?: string }) => {
    harness.selects.push(props);
    return createElement("div", { "data-select": props.id });
  },
}));

vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({
    plural: (entityType: string) => `${entityType}s`,
    singular: (entityType: string) => entityType,
  }),
}));

vi.mock("@/components/ui/use-overlay-focus-return", () => ({
  useOverlayFocusReturn: () => ({}),
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ pipelinesStore: store, deleteStageModalStore: form }),
}));

import { DeleteStageModal } from "../delete-stage-modal";

beforeEach(() => {
  harness.selects.length = 0;
  harness.actions.length = 0;
  harness.translationCalls.length = 0;
  store.stageDeletionPrompt = { stageId: "stage-lead", pipelineId: "sales", dealCount: 7 };
  store.stageDeletionTargets = [
    { id: "stage-qualified", name: "Qualified" },
    { id: "stage-won", name: "Won" },
  ];
  store.isSaving = false;
  form.form = { moveToStageId: "" };
  form.moveToStageId = "";
});

describe("DeleteStageModal", () => {
  it("stays closed while no stage deletion is being disputed", () => {
    store.stageDeletionPrompt = null;

    expect(renderToStaticMarkup(createElement(DeleteStageModal))).toBe("");
  });

  it("states the blocked deal count with the workspace term for deals", () => {
    renderToStaticMarkup(createElement(DeleteStageModal));

    expect(harness.translationCalls).toContainEqual({
      key: "Pipelines.deleteStage.description",
      values: { count: 7, dealSingular: "deal", deals: "deals" },
    });
    expect(harness.translationCalls).toContainEqual({
      key: "Pipelines.deleteStage.title",
      values: { deals: "deals" },
    });
  });

  it("offers every remaining stage of the pipeline as a destination", () => {
    renderToStaticMarkup(createElement(DeleteStageModal));

    expect(harness.selects).toHaveLength(1);
    expect(harness.selects[0].id).toBe("moveToStageId");
    expect(harness.selects[0].items).toEqual([
      { value: "stage-qualified", label: "Qualified" },
      { value: "stage-won", label: "Won" },
    ]);
  });

  it("blocks confirmation until a destination stage is chosen", () => {
    renderToStaticMarkup(createElement(DeleteStageModal));
    expect(harness.actions).toEqual([{ disabled: true }]);

    harness.actions.length = 0;
    form.moveToStageId = "stage-won";
    renderToStaticMarkup(createElement(DeleteStageModal));

    expect(harness.actions).toEqual([{ disabled: false }]);
  });

  it("keeps confirmation blocked while a mutation is already in flight", () => {
    form.moveToStageId = "stage-won";
    store.isSaving = true;

    renderToStaticMarkup(createElement(DeleteStageModal));

    expect(harness.actions).toEqual([{ disabled: true }]);
  });
});
