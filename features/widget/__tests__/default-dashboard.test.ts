import { describe, expect, it } from "vitest";

import { AggregationType, EntityType, WidgetGroupByType, WidgetKind } from "@/generated/prisma";

import { Breakpoint } from "@/core/types/breakpoint";
import { BREAKPOINTS } from "@/constants/breakpoints";
import { GRID_COLS } from "@/app/[locale]/(protected)/dashboard/components/grid.constants";
import { WidgetLayoutSchema } from "../widget.schema";
import { UpsertWidgetInputSchema } from "../upsert-widget.interactor";
import {
  DEFAULT_DASHBOARD_FUNNEL_PERIOD_DAYS,
  DEFAULT_DASHBOARD_SALES_CYCLE_PERIOD_DAYS,
  DEFAULT_DASHBOARD_WIDGET_KEYS,
  DEFAULT_DASHBOARD_WIN_RATE_PERIOD_DAYS,
  defaultDashboardWidgetInputs,
  defaultDashboardWidgetRows,
} from "../default-dashboard";

const PIPELINE_ID = "11111111-1111-4111-8111-111111111111";

const NAMES = {
  openPipelineValueByStage: "Open pipeline value by stage",
  pipelineFunnel: "Sales funnel",
  salesCycle: "Average sales cycle",
  winRate: "Win rate",
};

function rows() {
  let counter = 0;

  return defaultDashboardWidgetRows({
    companyId: "company-1",
    userId: "user-1",
    pipelineId: PIPELINE_ID,
    names: NAMES,
    newId: () => `widget-${++counter}`,
  });
}

function rowFor(name: string) {
  const row = rows().find((candidate) => candidate.name === name);
  if (!row) throw new Error(`no seeded widget named ${name}`);

  return row;
}

describe("default dashboard catalog", () => {
  it("only seeds configurations the widget write contract accepts", () => {
    const inputs = defaultDashboardWidgetInputs({ pipelineId: PIPELINE_ID, names: NAMES });

    for (const key of DEFAULT_DASHBOARD_WIDGET_KEYS) {
      const parsed = UpsertWidgetInputSchema.safeParse(inputs[key]);

      expect(parsed.success, `${key}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
    }
  });

  it("offers the founding admin the whole dashboard as company templates", () => {
    expect(rows()).toHaveLength(DEFAULT_DASHBOARD_WIDGET_KEYS.length);
    expect(rows().every((row) => row.isTemplate === true)).toBe(true);
    expect(rows().every((row) => row.companyId === "company-1" && row.userId === "user-1")).toBe(true);
    expect(new Set(rows().map((row) => row.id)).size).toBe(DEFAULT_DASHBOARD_WIDGET_KEYS.length);
  });

  it("counts open pipeline value per stage and leaves closed deals out of it", () => {
    const row = rowFor(NAMES.openPipelineValueByStage);

    expect(row.kind).toBe(WidgetKind.chart);
    expect(row.entityType).toBe(EntityType.deal);
    expect(row.groupByType).toBe(WidgetGroupByType.dealStage);
    expect(row.aggregationType).toBe(AggregationType.dealValue);
    expect(row.entityFilters).toEqual([{ field: "dealStatus", operator: "in", value: ["open"] }]);
  });

  it("bounds the win rate to a stated period rather than all time", () => {
    const row = rowFor(NAMES.winRate);

    expect(row.aggregationType).toBe(AggregationType.winRate);
    expect(row.periodDays).toBe(DEFAULT_DASHBOARD_WIN_RATE_PERIOD_DAYS);
    expect(row.groupByType).toBe(WidgetGroupByType.none);
  });

  it("never groups the win rate by stage, where won and lost stages force 100% and 0%", () => {
    const winRateRow = rowFor(NAMES.winRate);

    expect(winRateRow.groupByType).not.toBe(WidgetGroupByType.dealStage);
  });

  it("measures the sales cycle over a year and carries no filters the duration query cannot honour", () => {
    const row = rowFor(NAMES.salesCycle);

    expect(row.aggregationType).toBe(AggregationType.salesCycleDays);
    expect(row.periodDays).toBe(DEFAULT_DASHBOARD_SALES_CYCLE_PERIOD_DAYS);
    expect(row.entityFilters).toEqual([]);
    expect(row.dealFilters).toEqual([]);
  });

  it("points the funnel at the company's own default pipeline", () => {
    const row = rowFor(NAMES.pipelineFunnel);

    expect(row.kind).toBe(WidgetKind.funnel);
    expect(row.pipelineId).toBe(PIPELINE_ID);
    expect(row.periodDays).toBe(DEFAULT_DASHBOARD_FUNNEL_PERIOD_DAYS);
    expect(row.entityType).toBeNull();
    expect(row.aggregationType).toBeNull();
    expect(row.groupByType).toBeNull();
  });

  it("gives every widget a layout the dashboard grid can restore verbatim", () => {
    for (const row of rows()) {
      const parsed = WidgetLayoutSchema.safeParse(row.layout);

      expect(parsed.success, `${row.name}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);

      for (const breakpoint of BREAKPOINTS) {
        const item = parsed.success ? parsed.data[breakpoint] : undefined;

        expect(item?.i).toBe(row.id);
        expect((item?.x ?? 0) + (item?.w ?? 0)).toBeLessThanOrEqual(GRID_COLS[breakpoint]);
      }
    }
  });

  it("places the seeded widgets without overlapping at any breakpoint", () => {
    const seeded = rows();

    for (const breakpoint of BREAKPOINTS) {
      const boxes = seeded.map((row) => {
        const layout = WidgetLayoutSchema.parse(row.layout)[breakpoint];
        if (!layout) throw new Error(`no ${breakpoint} layout for ${row.name}`);

        return { x: layout.x, y: layout.y ?? 0, w: layout.w, h: layout.h };
      });

      for (let a = 0; a < boxes.length; a++) {
        for (let b = a + 1; b < boxes.length; b++) {
          const overlaps =
            boxes[a].x < boxes[b].x + boxes[b].w &&
            boxes[b].x < boxes[a].x + boxes[a].w &&
            boxes[a].y < boxes[b].y + boxes[b].h &&
            boxes[b].y < boxes[a].y + boxes[a].h;

          expect(overlaps, `${breakpoint}: widgets ${a} and ${b} overlap`).toBe(false);
        }
      }
    }
  });

  it("keeps the single-column breakpoints single column", () => {
    for (const row of rows()) {
      const layout = WidgetLayoutSchema.parse(row.layout);

      expect(layout[Breakpoint.xs]?.w).toBe(GRID_COLS[Breakpoint.xs]);
      expect(layout[Breakpoint.sm]?.w).toBe(GRID_COLS[Breakpoint.sm]);
    }
  });
});
