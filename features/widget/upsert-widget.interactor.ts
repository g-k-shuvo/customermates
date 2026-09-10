import type { FunnelPipelineOption, WidgetDto } from "./widget.schema";
import type { Data } from "@/core/validation/validation.utils";
import type { ValidateCustomColumnIdsInteractor } from "@/core/validation/validators/validate-custom-column-ids.interactor";
import type { ValidatePipelineIdsInteractor } from "@/core/validation/validators/validate-pipeline-ids.interactor";
import type { ValidateWidgetIdsInteractor } from "@/core/validation/validators/validate-widget-ids.interactor";
import type { FilterableField } from "@/core/base/base-get.schema";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";
import type { QueryParamsPrecheckInteractor } from "@/core/base/query-params-precheck.interactor";

import { z } from "zod";
import { EntityType, WidgetGroupByType, AggregationType, WidgetKind } from "@/generated/prisma";

import {
  WidgetDtoSchema,
  WidgetDisplayOptionsSchema,
  ActivityWidgetDisplayOptionsSchema,
  FunnelWidgetDisplayOptionsSchema,
} from "./widget.schema";
import {
  WIDGET_PERIOD_DAYS_MAX,
  groupsClosedDealsByCurrentStage,
  groupsClosedDealsByForecastMonth,
  groupsClosedDealsByLostOutcome,
  isDealDimensionGrouping,
  isDurationAggregation,
  isPeriodAggregation,
  isPipelinePositionGrouping,
  requiresRawDimensionQuery,
} from "./widget-aggregation";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { type Validated } from "@/core/validation/validation.utils";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { FilterSchema } from "@/core/base/base-get.schema";
import { filterValueKind } from "@/core/types/filter-field-value-kind";
import { ActivityFiltersSchema } from "@/ee/messaging/activities/activities.schema";

const ActivityWidgetInputSchema = z.object({
  id: z.uuid().optional(),
  kind: z.literal(WidgetKind.activityTimeline),
  name: z.string().min(1).max(255),
  timelineFilters: ActivityFiltersSchema.optional(),
  displayOptions: ActivityWidgetDisplayOptionsSchema.optional(),
  isTemplate: z.boolean(),
});

const FunnelWidgetInputSchema = z.object({
  id: z.uuid().optional(),
  kind: z.literal(WidgetKind.funnel),
  name: z.string().min(1).max(255),
  pipelineId: z.uuid(),
  periodDays: z.number().int().positive().max(WIDGET_PERIOD_DAYS_MAX).optional(),
  displayOptions: FunnelWidgetDisplayOptionsSchema.optional(),
  isTemplate: z.boolean(),
});

const ChartWidgetInputSchema = z
  .object({
    id: z.uuid().optional(),
    kind: z.literal(WidgetKind.chart),
    name: z.string().min(1).max(255),
    entityType: z.enum(EntityType),
    entityFilters: z.array(FilterSchema).optional(),
    dealFilters: z.array(FilterSchema).optional(),
    displayOptions: WidgetDisplayOptionsSchema.optional(),
    groupByType: z.enum(WidgetGroupByType),
    groupByCustomColumnId: z.uuid().optional(),
    aggregationType: z.enum(AggregationType),
    periodDays: z.number().int().positive().max(WIDGET_PERIOD_DAYS_MAX).optional(),
    isTemplate: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.groupByType === WidgetGroupByType.customColumn && !data.groupByCustomColumnId) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.widgetGroupByCustomColumnIdRequired },
        path: ["groupByCustomColumnId"],
      });
    }

    if (data.aggregationType === AggregationType.dealQuantity && data.entityType !== EntityType.service) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.widgetDealQuantityOnlyForService },
        path: ["aggregationType"],
      });
    }

    if (data.aggregationType === AggregationType.dealWeightedValue && data.entityType === EntityType.service) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.widgetWeightedValueNotAllowedForService },
        path: ["aggregationType"],
      });
    }

    if (
      data.entityType === EntityType.task &&
      (data.aggregationType === AggregationType.dealValue ||
        data.aggregationType === AggregationType.dealQuantity ||
        data.aggregationType === AggregationType.dealWeightedValue)
    ) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.widgetDealAggregationNotAllowedForTask },
        path: ["aggregationType"],
      });
    }

    const isGroupingByEntityTypeItself =
      data.groupByType &&
      ((data.entityType === EntityType.contact && data.groupByType === WidgetGroupByType.contact) ||
        (data.entityType === EntityType.organization && data.groupByType === WidgetGroupByType.organization) ||
        (data.entityType === EntityType.deal && data.groupByType === WidgetGroupByType.deal) ||
        (data.entityType === EntityType.service && data.groupByType === WidgetGroupByType.service));

    if (isGroupingByEntityTypeItself && data.aggregationType === AggregationType.count) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.widgetGroupByEntityTypeNotAllowedForCount },
        path: ["groupByType"],
      });
    }

    const groupsByDealDimension = isDealDimensionGrouping(data.groupByType);

    if (groupsByDealDimension && data.entityType !== EntityType.deal) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.widgetPipelineGroupingRequiresDeal },
        path: ["groupByType"],
      });
    }

    if (isPeriodAggregation(data.aggregationType)) {
      if (data.entityType !== EntityType.deal) {
        ctx.addIssue({
          code: "custom",
          params: { error: CustomErrorCode.widgetPeriodAggregationRequiresDeal },
          path: ["aggregationType"],
        });
      }

      const allowedGrouping = isDurationAggregation(data.aggregationType)
        ? isPipelinePositionGrouping(data.groupByType)
        : groupsByDealDimension;

      if (!allowedGrouping && data.groupByType !== WidgetGroupByType.none) {
        ctx.addIssue({
          code: "custom",
          params: { error: CustomErrorCode.widgetPeriodAggregationGroupingLimited },
          path: ["groupByType"],
        });
      }
    }

    if (groupsClosedDealsByCurrentStage(data.aggregationType, data.groupByType)) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.widgetClosedDealAggregationCannotGroupByStage },
        path: ["groupByType"],
      });
    }

    if (groupsClosedDealsByLostOutcome(data.aggregationType, data.groupByType)) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.widgetClosedDealAggregationCannotGroupByLostOutcome },
        path: ["groupByType"],
      });
    }

    if (groupsClosedDealsByForecastMonth(data.aggregationType, data.groupByType)) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.widgetClosedDealAggregationCannotGroupByForecastMonth },
        path: ["groupByType"],
      });
    }

    const carriesFilters = (data.entityFilters?.length ?? 0) > 0 || (data.dealFilters?.length ?? 0) > 0;

    if (isDurationAggregation(data.aggregationType) && carriesFilters) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.widgetDurationAggregationFiltersNotSupported },
        path: ["entityFilters"],
      });
    }

    if (requiresRawDimensionQuery(data.groupByType) && carriesFilters) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.widgetDealDimensionGroupingFiltersNotSupported },
        path: ["entityFilters"],
      });
    }

    if (
      data.groupByType &&
      !groupsByDealDimension &&
      data.groupByType !== WidgetGroupByType.customColumn &&
      data.groupByType !== WidgetGroupByType.none
    ) {
      const entityTypeToGroupByType: Record<EntityType, WidgetGroupByType | undefined> = {
        [EntityType.contact]: WidgetGroupByType.contact,
        [EntityType.organization]: WidgetGroupByType.organization,
        [EntityType.deal]: WidgetGroupByType.deal,
        [EntityType.service]: WidgetGroupByType.service,
        [EntityType.task]: undefined,
      };

      if (data.entityType === EntityType.task) {
        ctx.addIssue({
          code: "custom",
          params: { error: CustomErrorCode.widgetTaskCanOnlyGroupByCustomColumn },
          path: ["groupByType"],
        });
      } else if (data.groupByType !== entityTypeToGroupByType[data.entityType]) {
        ctx.addIssue({
          code: "custom",
          params: { error: CustomErrorCode.widgetGroupByTypeMustMatchEntityType },
          path: ["groupByType"],
        });
      }
    }

    if (data.entityType === EntityType.deal && data.dealFilters && data.dealFilters.length > 0) {
      ctx.addIssue({
        code: "custom",
        params: {
          error: CustomErrorCode.widgetDealFiltersNotAllowedForDealEntityType,
        },
        path: ["dealFilters"],
      });
    }
  });

export const UpsertWidgetInputSchema = z.discriminatedUnion("kind", [
  ChartWidgetInputSchema,
  ActivityWidgetInputSchema,
  FunnelWidgetInputSchema,
]);

export type UpsertWidgetData = Data<typeof UpsertWidgetInputSchema>;
export type UpsertChartWidgetData = Data<typeof ChartWidgetInputSchema>;
export type UpsertActivityWidgetData = Data<typeof ActivityWidgetInputSchema>;
export type UpsertFunnelWidgetData = Data<typeof FunnelWidgetInputSchema>;

type ActivityFilter = NonNullable<UpsertActivityWidgetData["timelineFilters"]>[number];

function unavailableFilterChangeError(
  requested: ActivityFilter,
  existing: ActivityFilter | undefined,
): CustomErrorCode | undefined {
  if (!existing) return CustomErrorCode.invalidFilterField;
  if (requested.operator !== existing.operator) return CustomErrorCode.invalidFilterOperator;

  const requestedHasValue = "value" in requested;
  const existingHasValue = "value" in existing;
  if (requestedHasValue !== existingHasValue) return CustomErrorCode.invalidFilterValue;
  if (!requestedHasValue || !existingHasValue) return undefined;

  const existingValues = new Set(existing.value.map(String));
  return requested.value.every((value) => existingValues.has(String(value)))
    ? undefined
    : CustomErrorCode.invalidFilterValue;
}

export abstract class UpsertWidgetRepo {
  abstract canReadMessagingSources(): boolean;
  abstract canReadPipelines(): boolean;
  abstract getActivityFilterableFields(): Promise<FilterableField[]>;
  abstract getFunnelPipelines(): Promise<FunnelPipelineOption[]>;
  abstract setMessagingSourcesEnabled(enabled: boolean): void;
  abstract upsertWidget(data: { data: UpsertWidgetData }): Promise<WidgetDto>;
  abstract getWidgetKind(id: string): Promise<WidgetKind | null>;
  abstract getWidgetById(id: string): Promise<WidgetDto | null>;
}

@TenantInteractor()
export class UpsertWidgetInteractor extends AuthenticatedInteractor<UpsertWidgetData, WidgetDto> {
  constructor(
    private repo: UpsertWidgetRepo,
    private widgetValidator: ValidateWidgetIdsInteractor,
    private customColumnValidator: ValidateCustomColumnIdsInteractor,
    private pipelineValidator: ValidatePipelineIdsInteractor,
    private queryParamsPrecheck: QueryParamsPrecheckInteractor,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Write({
    input: UpsertWidgetInputSchema,
    output: WidgetDtoSchema,
    tx: false,
    precheck: (self, data, ctx) => self.precheck(data, ctx),
  })
  async invoke(data: UpsertWidgetData): Validated<WidgetDto> {
    return {
      ok: true as const,
      data: await this.repo.upsertWidget({ data }),
    };
  }

  private async precheck(data: UpsertWidgetData, ctx: z.RefinementCtx) {
    const groupByCustomColumnId = data.kind === WidgetKind.chart ? data.groupByCustomColumnId : undefined;

    await Promise.all([
      data.id ? this.widgetValidator.invoke([{ ids: data.id, path: ["id"] }], ctx) : undefined,
      data.id ? this.validateKind(data.id, data.kind, ctx) : undefined,
      groupByCustomColumnId
        ? this.customColumnValidator.invoke([{ ids: groupByCustomColumnId, path: ["groupByCustomColumnId"] }], ctx)
        : undefined,
      data.kind === WidgetKind.activityTimeline ? this.validateActivityFilters(data, ctx) : undefined,
      data.kind === WidgetKind.funnel ? this.validateFunnelPipeline(data, ctx) : undefined,
    ]);
  }

  private async validateFunnelPipeline(data: UpsertFunnelWidgetData, ctx: z.RefinementCtx) {
    if (!this.repo.canReadPipelines()) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.widgetFunnelRequiresPipelineAccess },
        path: ["pipelineId"],
      });
      return;
    }

    await this.pipelineValidator.invoke([{ ids: data.pipelineId, path: ["pipelineId"] }], ctx);

    const pipelines = await this.repo.getFunnelPipelines();
    const selected = pipelines.find((pipeline) => pipeline.id === data.pipelineId);

    if (selected && selected.openStageCount === 0) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.widgetFunnelPipelineHasNoOpenStages },
        path: ["pipelineId"],
      });
    }
  }

  private async validateActivityFilters(data: UpsertActivityWidgetData, ctx: z.RefinementCtx) {
    const canReadMessagingSources = this.repo.canReadMessagingSources();
    const entitlementDenied = canReadMessagingSources ? await this.entitlements.require("messaging") : null;
    this.repo.setMessagingSourcesEnabled(canReadMessagingSources && !entitlementDenied);
    const fields = await this.repo.getActivityFilterableFields();

    if (!fields.length && !data.id) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.activitySourcesUnavailable },
        path: ["kind"],
      });
      return;
    }

    if (data.timelineFilters === undefined) return;

    const validationFields = fields.map((field) => ({
      ...field,
      operators: [...field.operators],
    }));
    const allowedUnavailableEntityIdsByField = new Map<string, Set<string>>();
    if (data.id) {
      const existing = await this.repo.getWidgetById(data.id);
      if (existing?.kind === WidgetKind.activityTimeline) {
        const existingFiltersByField = new Map(
          existing.timelineFilters.map((filter) => [String(filter.field), filter]),
        );

        data.timelineFilters.forEach((filter, index) => {
          const currentField = fields.find((candidate) => String(candidate.field) === String(filter.field));
          const operatorIsAvailable = currentField?.operators.includes(
            filter.operator as FilterableField["operators"][number],
          );
          if (operatorIsAvailable) return;

          const error = unavailableFilterChangeError(filter, existingFiltersByField.get(String(filter.field)));
          if (error) {
            const issueKey =
              error === CustomErrorCode.invalidFilterField
                ? "field"
                : error === CustomErrorCode.invalidFilterOperator
                  ? "operator"
                  : "value";
            ctx.addIssue({
              code: "custom",
              params: { error },
              path: ["timelineFilters", index, issueKey],
            });
          }
        });

        for (const filter of existing.timelineFilters) {
          const field = validationFields.find((candidate) => String(candidate.field) === String(filter.field));
          const operator = filter.operator as FilterableField["operators"][number];
          if (field) {
            if (!field.operators.includes(operator)) field.operators.push(operator);
          } else {
            validationFields.push({
              field: filter.field,
              operators: [operator],
            });
          }

          if ("value" in filter) {
            const values = Array.isArray(filter.value) ? filter.value : [filter.value];
            const allowed = allowedUnavailableEntityIdsByField.get(String(filter.field)) ?? new Set<string>();
            values.forEach((value) => allowed.add(String(value)));
            allowedUnavailableEntityIdsByField.set(String(filter.field), allowed);
          }
        }
      }
    }

    const prefixedCtx = {
      addIssue: (issue: Parameters<z.RefinementCtx["addIssue"]>[0]) => {
        if (typeof issue === "string") {
          ctx.addIssue(issue);
          return;
        }

        const path = issue.path?.[0] === "filters" ? issue.path.slice(1) : (issue.path ?? []);
        ctx.addIssue({ ...issue, path: ["timelineFilters", ...path] });
      },
    } as z.RefinementCtx;

    const precheckFilters = data.timelineFilters.map((filter) => {
      if (!("value" in filter)) return filter;
      if (filterValueKind(String(filter.field))?.kind !== "entityId") return filter;

      const retained = allowedUnavailableEntityIdsByField.get(String(filter.field));
      if (!retained) return filter;

      const values = Array.isArray(filter.value) ? filter.value : [filter.value];
      return { ...filter, value: values.filter((value) => !retained.has(String(value))) };
    });

    await this.queryParamsPrecheck.invoke(
      {
        filterableFields: validationFields,
        customColumns: [],
        sortableFields: [],
      },
      undefined,
      { filters: precheckFilters },
      prefixedCtx,
    );
  }

  private async validateKind(id: string, kind: WidgetKind, ctx: z.RefinementCtx) {
    const existingKind = await this.repo.getWidgetKind(id);
    if (existingKind && existingKind !== kind) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.widgetKindImmutable },
        path: ["kind"],
      });
    }
  }
}
