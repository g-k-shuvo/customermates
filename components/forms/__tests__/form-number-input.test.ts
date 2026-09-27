import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const form = vi.hoisted(() => ({ value: 2500 as number | undefined, onChange: vi.fn() }));

vi.mock("@/components/forms/form-context", () => ({
  useAppForm: () => ({
    getError: () => undefined,
    getValue: () => form.value,
    isDisabled: false,
    isLoading: false,
    isReadOnly: false,
    onChange: form.onChange,
  }),
}));

vi.mock("@/components/forms/use-form-field", () => ({
  useFormFieldErrors: () => ({ hasError: false }),
  useResolvedFieldLabel: (_id: string, label?: string | null) => label,
}));

vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({
    formatNumber: (value: number) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ","),
    formatNumberForEditing: (value: number | undefined) => (value == null ? "" : String(value)),
    parseNumber: (text: string) => (text.trim() === "" ? undefined : Number(text.replaceAll(",", ""))),
  }),
}));

import { FormNumberInput } from "../form-number-input";

const roots: Root[] = [];

function mountInput() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(createElement(FormNumberInput, { id: "baseValue", label: "Base value" })));
  const input = container.querySelector("input");
  if (!input) throw new Error("input not rendered");
  return input;
}

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = "";
  form.value = 2500;
});

describe("FormNumberInput focus", () => {
  it("keeps a whole-value selection when focus swaps the formatted text for the editable one", () => {
    const input = mountInput();
    expect(input.value).toBe("2,500");

    act(() => {
      input.select();
      input.focus();
    });

    expect(input.value).toBe("2500");
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 4]);
  });

  it("leaves a caret placed inside the value alone", () => {
    const input = mountInput();

    act(() => {
      input.setSelectionRange(1, 1);
      input.focus();
    });

    expect(input.value).toBe("2500");
    expect(input.selectionStart).toBe(input.selectionEnd);
  });
});
