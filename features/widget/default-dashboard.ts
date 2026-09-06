import type { UpsertChartWidgetData, UpsertFunnelWidgetData, UpsertWidgetData } from "./upsert-widget.interactor";
import type { WidgetLayout } from "./widget.schema";
import type { Prisma } from "@/generated/prisma";

import { AggregationType, DealStatus, EntityType, WidgetGroupByType, WidgetKind } from "@/generated/prisma";

import { Breakpoint } from "@/core/types/breakpoint";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { DisplayType } from "./widget.schema";

export const DEFAULT_DASHBOARD_WIDGET_KEYS = [
  "openPipelineValueByStage",
  "pipelineFunnel",
  "winRate",
  "salesCycle",
] as const;

export type DefaultDashboardWidgetKey = (typeof DEFAULT_DASHBOARD_WIDGET_KEYS)[number];

export const DEFAULT_DASHBOARD_WIN_RATE_PERIOD_DAYS = 90;

export const DEFAULT_DASHBOARD_FUNNEL_PERIOD_DAYS = 90;

export const DEFAULT_DASHBOARD_SALES_CYCLE_PERIOD_DAYS = 365;

type LayoutBox = { x: number; y: number; w: number; h: number };

const DEFAULT_DASHBOARD_LAYOUT: Record<DefaultDashboardWidgetKey, Record<Breakpoint, LayoutBox>> = {
  openPipelineValueByStage: {
    [Breakpoint.lg]: { x: 0, y: 0, w: 6, h: 4 },
    [Breakpoint.md]: { x: 0, y: 0, w: 4, h: 4 },
    [Breakpoint.sm]: { x: 0, y: 0, w: 4, h: 4 },
    [Breakpoint.xs]: { x: 0, y: 0, w: 2, h: 4 },
  },
  pipelineFunnel: {
    [Breakpoint.lg]: { x: 6, y: 0, w: 6, h: 4 },
    [Breakpoint.md]: { x: 4, y: 0, w: 4, h: 4 },
    [Breakpoint.sm]: { x: 0, y: 4, w: 4, h: 4 },
    [Breakpoint.xs]: { x: 0, y: 4, w: 2, h: 4 },
  },
  winRate: {
    [Breakpoint.lg]: { x: 0, y: 4, w: 6, h: 4 },
    [Breakpoint.md]: { x: 0, y: 4, w: 4, h: 4 },
    [Breakpoint.sm]: { x: 0, y: 8, w: 4, h: 4 },
    [Breakpoint.xs]: { x: 0, y: 8, w: 2, h: 4 },
  },
  salesCycle: {
    [Breakpoint.lg]: { x: 6, y: 4, w: 6, h: 4 },
    [Breakpoint.md]: { x: 4, y: 4, w: 4, h: 4 },
    [Breakpoint.sm]: { x: 0, y: 12, w: 4, h: 4 },
    [Breakpoint.xs]: { x: 0, y: 12, w: 2, h: 4 },
  },
};

const OPEN_DEALS_ONLY = {
  field: FilterFieldKey.dealStatus as string,
  operator: FilterOperatorKey.in as const,
  value: [DealStatus.open as string],
};

function openPipelineValueByStage(name: string): UpsertChartWidgetData {
  return {
    kind: WidgetKind.chart,
    name,
    entityType: EntityType.deal,
    entityFilters: [OPEN_DEALS_ONLY],
    dealFilters: [],
    groupByType: WidgetGroupByType.dealStage,
    aggregationType: AggregationType.dealValue,
    displayOptions: { displayType: DisplayType.horizontalBarChartWithLabels },
    isTemplate: true,
  };
}

function winRate(name: string): UpsertChartWidgetData {
  return {
    kind: WidgetKind.chart,
    name,
    entityType: EntityType.deal,
    entityFilters: [],
    dealFilters: [],
    groupByType: WidgetGroupByType.none,
    aggregationType: AggregationType.winRate,
    periodDays: DEFAULT_DASHBOARD_WIN_RATE_PERIOD_DAYS,
    displayOptions: { displayType: DisplayType.horizontalBarChartWithLabels },
    isTemplate: true,
  };
}

function salesCycle(name: string): UpsertChartWidgetData {
  return {
    kind: WidgetKind.chart,
    name,
    entityType: EntityType.deal,
    entityFilters: [],
    dealFilters: [],
    groupByType: WidgetGroupByType.none,
    aggregationType: AggregationType.salesCycleDays,
    periodDays: DEFAULT_DASHBOARD_SALES_CYCLE_PERIOD_DAYS,
    displayOptions: { displayType: DisplayType.horizontalBarChartWithLabels },
    isTemplate: true,
  };
}

function pipelineFunnel(name: string, pipelineId: string): UpsertFunnelWidgetData {
  return {
    kind: WidgetKind.funnel,
    name,
    pipelineId,
    periodDays: DEFAULT_DASHBOARD_FUNNEL_PERIOD_DAYS,
    isTemplate: true,
  };
}

export function defaultDashboardWidgetInputs(args: {
  pipelineId: string;
  names: Record<DefaultDashboardWidgetKey, string>;
}): Record<DefaultDashboardWidgetKey, UpsertWidgetData> {
  const { names, pipelineId } = args;

  return {
    openPipelineValueByStage: openPipelineValueByStage(names.openPipelineValueByStage),
    pipelineFunnel: pipelineFunnel(names.pipelineFunnel, pipelineId),
    winRate: winRate(names.winRate),
    salesCycle: salesCycle(names.salesCycle),
  };
}

export function defaultDashboardLayout(key: DefaultDashboardWidgetKey, widgetId: string): WidgetLayout {
  const boxes = DEFAULT_DASHBOARD_LAYOUT[key];
  const item = (breakpoint: Breakpoint) => ({ i: widgetId, ...boxes[breakpoint] });

  return {
    xs: item(Breakpoint.xs),
    sm: item(Breakpoint.sm),
    md: item(Breakpoint.md),
    lg: item(Breakpoint.lg),
  };
}

function toWidgetRow(args: {
  companyId: string;
  userId: string;
  widgetId: string;
  key: DefaultDashboardWidgetKey;
  input: UpsertWidgetData;
}): Prisma.WidgetCreateManyInput {
  const { companyId, input, key, userId, widgetId } = args;

  const common = {
    id: widgetId,
    companyId,
    userId,
    name: input.name,
    isTemplate: input.isTemplate,
    layout: defaultDashboardLayout(key, widgetId),
  };

  switch (input.kind) {
    case WidgetKind.chart:
      return {
        ...common,
        kind: WidgetKind.chart,
        entityType: input.entityType,
        entityFilters: input.entityFilters ?? [],
        dealFilters: input.dealFilters ?? [],
        displayOptions: input.displayOptions,
        groupByType: input.groupByType,
        groupByCustomColumnId: input.groupByCustomColumnId ?? null,
        aggregationType: input.aggregationType,
        periodDays: input.periodDays ?? null,
        pipelineId: null,
      };
    case WidgetKind.funnel:
      return {
        ...common,
        kind: WidgetKind.funnel,
        entityType: null,
        groupByType: null,
        groupByCustomColumnId: null,
        aggregationType: null,
        pipelineId: input.pipelineId,
        periodDays: input.periodDays ?? null,
        displayOptions: input.displayOptions,
      };
    case WidgetKind.activityTimeline:
      return {
        ...common,
        kind: WidgetKind.activityTimeline,
        entityType: null,
        groupByType: null,
        groupByCustomColumnId: null,
        aggregationType: null,
        periodDays: null,
        pipelineId: null,
        timelineFilters: input.timelineFilters ?? [],
        displayOptions: input.displayOptions,
      };
    default: {
      const exhaustive: never = input;
      return exhaustive;
    }
  }
}

export function defaultDashboardWidgetRows(args: {
  companyId: string;
  userId: string;
  pipelineId: string;
  names: Record<DefaultDashboardWidgetKey, string>;
  newId: () => string;
}): Prisma.WidgetCreateManyInput[] {
  const { companyId, names, newId, pipelineId, userId } = args;
  const inputs = defaultDashboardWidgetInputs({ names, pipelineId });

  return DEFAULT_DASHBOARD_WIDGET_KEYS.map((key) =>
    toWidgetRow({ companyId, userId, widgetId: newId(), key, input: inputs[key] }),
  );
}
