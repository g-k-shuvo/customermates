import type { Root } from "react-dom/client";
import type { ReactElement } from "react";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AggregationType } from "@/generated/prisma";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({
    formatNumber: (value: number) => String(value),
    formatCurrency: (value: number) => `$${value}`,
  }),
}));

import { TooltipContent } from "../chart-tooltip";

const roots: Root[] = [];
const containers: HTMLElement[] = [];

function mount(element: ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(element));

  return container;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
  for (const container of containers.splice(0)) container.remove();
});

describe("TooltipContent", () => {
  it("shows the median beside the mean of a hovered group", () => {
    const container = mount(
      createElement(TooltipContent, {
        active: true,
        aggregationType: AggregationType.salesCycleDays,
        label: "Enterprise",
        payload: [{ payload: { label: "Enterprise", metricsNote: "Median 14 days" }, value: 21 }],
      }),
    );

    expect(container.textContent).toContain("21");
    expect(container.textContent).toContain("Median 14 days");
  });

  it("shows the closed-deal count behind a hovered win rate", () => {
    const container = mount(
      createElement(TooltipContent, {
        active: true,
        aggregationType: AggregationType.winRate,
        label: "Enterprise",
        payload: [{ payload: { label: "Enterprise", metricsNote: "4 closed deals, open deals excluded" }, value: 75 }],
      }),
    );

    expect(container.textContent).toContain("4 closed deals, open deals excluded");
  });

  it("annotates every group of a multi-series tooltip", () => {
    const container = mount(
      createElement(TooltipContent, {
        active: true,
        aggregationType: AggregationType.salesCycleDays,
        label: "Q1",
        payload: [
          { payload: { label: "Enterprise", metricsNote: "Median 14 days" }, value: 21 },
          { payload: { label: "SMB", metricsNote: "Median 5 days" }, value: 8 },
        ],
      }),
    );

    expect(container.textContent).toContain("Median 14 days");
    expect(container.textContent).toContain("Median 5 days");
  });

  it("leaves a group without metrics unannotated", () => {
    const container = mount(
      createElement(TooltipContent, {
        active: true,
        aggregationType: AggregationType.dealValue,
        label: "Enterprise",
        payload: [{ payload: { label: "Enterprise" }, value: 1200 }],
      }),
    );

    expect(container.textContent).toBe("Enterprise$1200");
  });
});
