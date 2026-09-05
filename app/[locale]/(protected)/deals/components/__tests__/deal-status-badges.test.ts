import type { ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  chips: [] as Array<{ variant?: string; tooltip?: unknown; label: string }>,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/chip/app-chip", () => ({
  AppChip: ({
    children,
    tooltip,
    variant,
  }: {
    children: ReactNode;
    startContent?: ReactNode;
    tooltip?: ReactNode;
    variant?: string;
  }) => {
    harness.chips.push({ variant, tooltip, label: String(children) });
    return createElement("span", { "data-variant": variant }, children);
  },
}));

import { DealStatus } from "@/generated/prisma";

import { DealRottingBadge, DealStatusBadge } from "../deal-status-badges";

beforeEach(() => {
  harness.chips.length = 0;
});

describe("DealStatusBadge", () => {
  it("tells a won record apart from a lost one by tone and label", () => {
    renderToStaticMarkup(createElement(DealStatusBadge, { status: DealStatus.won }));
    renderToStaticMarkup(createElement(DealStatusBadge, { status: DealStatus.lost }));
    renderToStaticMarkup(createElement(DealStatusBadge, { status: DealStatus.open }));

    expect(harness.chips).toEqual([
      { variant: "success", tooltip: undefined, label: "Common.dealStatuses.won" },
      { variant: "destructive", tooltip: undefined, label: "Common.dealStatuses.lost" },
      { variant: "secondary", tooltip: undefined, label: "Common.dealStatuses.open" },
    ]);
  });

  it("names the reason on a lost record", () => {
    const markup = renderToStaticMarkup(
      createElement(DealStatusBadge, { status: DealStatus.lost, lostReasonName: "Price" }),
    );

    expect(markup).toContain("Price");
    expect(harness.chips[0]).toEqual({
      variant: "destructive",
      tooltip: "Price",
      label: "Common.dealStatuses.lost · Price",
    });
  });

  it("ignores a stale reason on a record that is not lost", () => {
    renderToStaticMarkup(createElement(DealStatusBadge, { status: DealStatus.open, lostReasonName: "Price" }));

    expect(harness.chips[0].label).toBe("Common.dealStatuses.open");
  });
});

describe("DealRottingBadge", () => {
  it("stays out of the way while the record is healthy", () => {
    expect(renderToStaticMarkup(createElement(DealRottingBadge, { isRotting: false }))).toBe("");
    expect(harness.chips).toEqual([]);
  });

  it("warns once the record has passed its stage deadline", () => {
    renderToStaticMarkup(createElement(DealRottingBadge, { isRotting: true }));

    expect(harness.chips).toEqual([
      { variant: "warning", tooltip: undefined, label: "Common.filters.rottingValues.rotting" },
    ]);
  });
});
