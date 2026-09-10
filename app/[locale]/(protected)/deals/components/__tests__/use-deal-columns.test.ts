import type { ColumnDef } from "@tanstack/react-table";
import type { ReactElement, ReactNode } from "react";
import type { DealDto } from "@/features/deals/deal.schema";

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
  AppChip: ({ children, tooltip, variant }: { children: ReactNode; tooltip?: ReactNode; variant?: string }) => {
    harness.chips.push({ variant, tooltip, label: String(children) });
    return createElement("span", { "data-variant": variant }, children);
  },
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ dealsStore: { customColumns: [] }, userModalStore: { loadById: vi.fn() } }),
}));

vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({
    formatCurrency: (value: number) => `€${value}`,
    formatNumber: (value: number) => `${value}`,
    formatNumericalShortDateTime: () => "",
  }),
}));

vi.mock("@/components/entity-detail/hooks/use-entity-drawer-stack", () => ({
  useEntityHref: () => () => "#",
  useOpenEntity: () => () => undefined,
}));

import { DealStatus } from "@/generated/prisma";

import { useDealColumns } from "../use-deal-columns";

type CellRenderer = (context: { row: { original: DealDto } }) => ReactNode;

const LOST_DEAL = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Acme renewal",
  status: DealStatus.lost,
  lostReasonId: "00000000-0000-4000-8000-000000000080",
  lostReasonName: "Lost to competitor",
  isRotting: false,
  tasks: [],
} as unknown as DealDto;

function dealColumns(): ColumnDef<DealDto>[] {
  let captured: ColumnDef<DealDto>[] = [];

  const Probe = () => {
    captured = useDealColumns(false);

    return null;
  };

  renderToStaticMarkup(createElement(Probe));

  return captured;
}

function renderCell(columnId: string, deal: DealDto): string {
  const column = dealColumns().find((candidate) => candidate.id === columnId);

  if (!column?.cell) throw new Error(`no ${columnId} column`);

  const rendered = (column.cell as unknown as CellRenderer)({ row: { original: deal } });

  return renderToStaticMarkup(rendered as ReactElement);
}

beforeEach(() => {
  harness.chips.length = 0;
});

describe("the deal status cell", () => {
  it("names the lost reason, so the table and the board card say more than lost", () => {
    const markup = renderCell("status", LOST_DEAL);

    expect(markup).toContain("Lost to competitor");
    expect(harness.chips[0]).toEqual({
      variant: "destructive",
      tooltip: "Lost to competitor",
      label: "Common.dealStatuses.lost · Lost to competitor",
    });
  });

  it("says only the status while the record carries no reason", () => {
    renderCell("status", { ...LOST_DEAL, lostReasonName: null });

    expect(harness.chips[0].label).toBe("Common.dealStatuses.lost");
  });
});

describe("the lost reason column", () => {
  it("is part of the catalogue and renders the reason on its own", () => {
    expect(renderCell("lostReason", LOST_DEAL)).toContain("Lost to competitor");
  });

  it("stays empty for a record that was never lost", () => {
    const open = { ...LOST_DEAL, status: DealStatus.open, lostReasonId: null, lostReasonName: null };

    expect(renderCell("lostReason", open)).not.toContain("Lost to competitor");
  });
});
