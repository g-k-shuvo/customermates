import type {
  ChartWidgetDto,
  DiagramDataPoint,
  FunnelStagePoint,
  FunnelSummary,
  FunnelWidgetDto,
  WidgetDataSummary,
} from "../widget.schema";
import type { FunnelStageDefinition } from "../widget-funnel";
import type { Filter } from "@/core/base/base-get.schema";

export type WidgetForCalculation = Pick<
  ChartWidgetDto,
  "entityType" | "groupByType" | "groupByCustomColumnId" | "aggregationType" | "periodDays" | "displayOptions"
> & {
  entityFilters: Filter[];
  dealFilters: Filter[];
};

export type WidgetCalculation = {
  data: DiagramDataPoint[];
  dataSummary: WidgetDataSummary | null;
};

export type GroupAccumulator = Map<string, DiagramDataPoint>;

export type EntityForGrouping = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
};

export type DealRecord = {
  id: string;
  name: string | null;
  totalValue: number;
  totalQuantity: number;
  weightedValue: number | null;
  contacts?: { contact: { id: string; firstName: string | null; lastName: string | null } }[];
  organizations?: { organization: { id: string; name: string | null } }[];
  services?: { service: { id: string; name: string | null; amount: number }; quantity: number }[];
};

export type PipelinePosition = {
  id: string;
  name: string;
  position: number;
};

export type StagePosition = PipelinePosition & {
  pipelineId: string;
  pipelinePosition: number;
};

export type GroupedDealAggregate = {
  key: string | null;
  count: number;
  totalValue: number;
  totalQuantity: number;
  weightedValue: number;
};

export type WinRateRow = {
  key: string | null;
  wonCount: number;
  lostCount: number;
  wonValue: number;
  lostValue: number;
};

export type DurationRow = {
  key: string | null;
  isTotal: boolean;
  sampleSize: number;
  meanDays: number | null;
  medianDays: number | null;
};

export type PeriodWindow = {
  from: Date;
  to: Date;
};

export type FunnelForCalculation = Pick<FunnelWidgetDto, "pipelineId" | "periodDays">;

export type FunnelPipeline = {
  name: string;
  stages: FunnelStageDefinition[];
};

export type FunnelCalculation = {
  pipelineName: string | null;
  stages: FunnelStagePoint[];
  summary: FunnelSummary | null;
};
