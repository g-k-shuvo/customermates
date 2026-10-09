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
    parseNumber: (text: string) => {
      const parsed = Number(text.replaceAll(",", ""));
      return text.trim() === "" || Number.isNaN(parsed) ? undefined : parsed;
    },
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

function type(input: HTMLInputElement, text: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  act(() => {
    descriptor?.set?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = "";
  form.value = 2500;
  form.onChange.mockClear();
});

describe("FormNumberInput typing", () => {
  it("keeps the stored number when the text is not a number", () => {
    const input = mountInput();
    act(() => input.focus());

    type(input, "12abc");
    act(() => input.blur());

    expect(form.onChange).not.toHaveBeenCalledWith("baseValue", undefined);
    expect(input.value).toBe("2,500");
  });

  it("clears the stored number when the field is emptied", () => {
    const input = mountInput();
    act(() => input.focus());

    type(input, "");
    act(() => input.blur());

    expect(form.onChange).toHaveBeenLastCalledWith("baseValue", undefined);
  });

  it("commits a valid number as it is typed", () => {
    const input = mountInput();
    act(() => input.focus());

    type(input, "1200");

    expect(form.onChange).toHaveBeenLastCalledWith("baseValue", 1200);
  });
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
