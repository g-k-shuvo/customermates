import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { EntityType, WidgetGroupByType, AggregationType, WidgetKind } from "@/generated/prisma";

import { CHIP_COLORS } from "@/constants/chip-colors";
import { FilterSchema } from "@/core/base/base-get.schema";
import { ActivityFiltersSchema } from "@/ee/messaging/activities/activities.schema";

export enum ChartColor {
  default1 = "default1",
  default2 = "default2",
  default3 = "default3",
  primary1 = "primary1",
  primary2 = "primary2",
  primary3 = "primary3",
  secondary1 = "secondary1",
  secondary2 = "secondary2",
  secondary3 = "secondary3",
  success1 = "success1",
  success2 = "success2",
  success3 = "success3",
  warning1 = "warning1",
  warning2 = "warning2",
  warning3 = "warning3",
  danger1 = "danger1",
  danger2 = "danger2",
  danger3 = "danger3",
}

export enum WinRateBasis {
  count = "count",
  value = "value",
}

export enum DisplayType {
  verticalBarChart = "verticalBarChart",
  horizontalBarChart = "horizontalBarChart",
  verticalBarChartWithLabels = "verticalBarChartWithLabels",
  horizontalBarChartWithLabels = "horizontalBarChartWithLabels",
  doughnutChart = "doughnutChart",
  radarChart = "radarChart",
}

export const CompanyWidgetSchema = z.object({
  id: z.string(),
  kind: z.enum(WidgetKind),
  name: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  avatarUrl: z.string().nullable(),
});

export type CompanyWidget = Data<typeof CompanyWidgetSchema>;

export const CompanyWidgetsResultSchema = z.object({
  widgets: z.array(CompanyWidgetSchema),
});

export const WidgetDisplayOptionsSchema = z.object({
  barColors: z.array(z.enum(ChartColor)).optional(),
  displayType: z.enum(DisplayType),
  reverseXAxis: z.boolean().optional(),
  reverseYAxis: z.boolean().optional(),
  useGroupColors: z.boolean().optional(),
  showLegend: z.boolean().optional(),
  showFilters: z.boolean().optional(),
  winRateBasis: z.enum(WinRateBasis).optional(),
});

export type WidgetDisplayOptions = Data<typeof WidgetDisplayOptionsSchema>;

export const WidgetLayoutItemSchema = z.object({
  i: z.string(),
  x: z.number(),
  y: z.number().nullish(),
  w: z.number(),
  h: z.number(),
  minW: z.number().optional(),
  maxW: z.number().optional(),
  minH: z.number().optional(),
  maxH: z.number().optional(),
});

export const WidgetLayoutSchema = z.object({
  xs: WidgetLayoutItemSchema.optional(),
  sm: WidgetLayoutItemSchema.optional(),
  md: WidgetLayoutItemSchema.optional(),
  lg: WidgetLayoutItemSchema.optional(),
});

export type WidgetLayout = Data<typeof WidgetLayoutSchema>;

export const DIAGRAM_SYSTEM_LABEL_KEYS = ["noGroup", "total"] as const;

export const DiagramMetricsSchema = z
  .object({
    mean: z.number().nullable(),
    median: z.number().nullable(),
    sampleSize: z.number(),
    wonCount: z.number(),
    lostCount: z.number(),
    wonValue: z.number(),
    lostValue: z.number(),
  })
  .partial()
  .strict();

export type DiagramMetrics = Data<typeof DiagramMetricsSchema>;

const DiagramDataPointFields = {
  value: z.number(),
  optionColor: z.enum(CHIP_COLORS).optional(),
  metrics: DiagramMetricsSchema.optional(),
};

export const DIAGRAM_MONTH_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/;

export const DiagramDataPointSchema = z.discriminatedUnion("labelKind", [
  z.object({ labelKind: z.literal("literal"), label: z.string().min(1), ...DiagramDataPointFields }).strict(),
  z
    .object({
      labelKind: z.literal("month"),
      month: z.string().regex(DIAGRAM_MONTH_PATTERN),
      ...DiagramDataPointFields,
    })
    .strict(),
  z
    .object({
      labelKind: z.literal("system"),
      systemLabelKey: z.enum(DIAGRAM_SYSTEM_LABEL_KEYS),
      ...DiagramDataPointFields,
    })
    .strict(),
]);

export type DiagramDataPoint = Data<typeof DiagramDataPointSchema>;

export const ActivityWidgetDisplayOptionsSchema = z.object({
  showFilters: z.boolean().optional(),
});

export type ActivityWidgetDisplayOptions = Data<typeof ActivityWidgetDisplayOptionsSchema>;

const WidgetBaseDtoSchema = z.object({
  id: z.uuid(),
  userId: z.string(),
  companyId: z.string(),
  name: z.string(),
  layout: WidgetLayoutSchema.nullable(),
  isTemplate: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const WidgetDataSummarySchema = z
  .object({
    headline: z.number().nullable(),
    median: z.number().nullable(),
    sampleSize: z.number(),
  })
  .strict();

export type WidgetDataSummary = Data<typeof WidgetDataSummarySchema>;

export const ChartWidgetDtoSchema = WidgetBaseDtoSchema.extend({
  kind: z.literal(WidgetKind.chart),
  entityType: z.enum(EntityType),
  entityFilters: z.array(FilterSchema),
  dealFilters: z.array(FilterSchema),
  displayOptions: WidgetDisplayOptionsSchema.nullable(),
  groupByType: z.enum(WidgetGroupByType),
  groupByCustomColumnId: z.string().nullable(),
  aggregationType: z.enum(AggregationType),
  periodDays: z.number().nullable(),
  data: z.array(DiagramDataPointSchema),
  dataSummary: WidgetDataSummarySchema.nullable(),
});

export type ChartWidgetDto = Data<typeof ChartWidgetDtoSchema>;

export const ActivityWidgetDtoSchema = WidgetBaseDtoSchema.extend({
  kind: z.literal(WidgetKind.activityTimeline),
  timelineFilters: ActivityFiltersSchema,
  displayOptions: ActivityWidgetDisplayOptionsSchema.nullable(),
});

export type ActivityWidgetDto = Data<typeof ActivityWidgetDtoSchema>;

export const FunnelWidgetDisplayOptionsSchema = z.object({
  showFilters: z.boolean().optional(),
});

export type FunnelWidgetDisplayOptions = Data<typeof FunnelWidgetDisplayOptionsSchema>;

export const FunnelStagePointSchema = z
  .object({
    stageId: z.string(),
    label: z.string(),
    position: z.number(),
    enteredCount: z.number(),
    advancedCount: z.number(),
    conversionToNextPercent: z.number().nullable(),
    nextStageLabel: z.string().nullable(),
  })
  .strict();

export type FunnelStagePoint = Data<typeof FunnelStagePointSchema>;

export const FunnelSummarySchema = z
  .object({
    dealsEntered: z.number(),
    wonCount: z.number(),
    openToWonPercent: z.number().nullable(),
  })
  .strict();

export type FunnelSummary = Data<typeof FunnelSummarySchema>;

export const FunnelPipelineOptionSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  openStageCount: z.number().int(),
});

export type FunnelPipelineOption = Data<typeof FunnelPipelineOptionSchema>;

export const FunnelWidgetDtoSchema = WidgetBaseDtoSchema.extend({
  kind: z.literal(WidgetKind.funnel),
  pipelineId: z.string().nullable(),
  pipelineName: z.string().nullable(),
  periodDays: z.number().nullable(),
  displayOptions: FunnelWidgetDisplayOptionsSchema.nullable(),
  stages: z.array(FunnelStagePointSchema),
  summary: FunnelSummarySchema.nullable(),
});

export type FunnelWidgetDto = Data<typeof FunnelWidgetDtoSchema>;

export const WidgetDtoSchema = z.discriminatedUnion("kind", [
  ChartWidgetDtoSchema,
  ActivityWidgetDtoSchema,
  FunnelWidgetDtoSchema,
]);

export type WidgetDto = Data<typeof WidgetDtoSchema>;

export function supportsDealFilters({
  aggregationType,
  entityType,
}: {
  aggregationType: AggregationType;
  entityType: EntityType;
}) {
  return (
    entityType !== EntityType.deal &&
    (aggregationType === AggregationType.dealValue ||
      aggregationType === AggregationType.dealQuantity ||
      aggregationType === AggregationType.dealWeightedValue)
  );
}

export function isChartWidget(widget: WidgetDto): widget is ChartWidgetDto {
  return widget.kind === WidgetKind.chart;
}

export function isActivityWidget(widget: WidgetDto): widget is ActivityWidgetDto {
  return widget.kind === WidgetKind.activityTimeline;
}

export function isFunnelWidget(widget: WidgetDto): widget is FunnelWidgetDto {
  return widget.kind === WidgetKind.funnel;
}
