import type { RepoArgs } from "@/core/utils/types";
import type { GetWidgetsRepo } from "./get-widgets.interactor";
import type { UpsertWidgetRepo } from "./upsert-widget.interactor";
import type { DeleteWidgetRepo } from "./delete-widget.interactor";
import type { GetCompanyWidgetsRepo } from "./get-company-widgets.interactor";
import type { GetWidgetByIdRepo } from "./get-widget-by-id.interactor";
import type { UpdateWidgetLayoutsRepo } from "./update-widget-layouts.interactor";
import type { FindWidgetsByIdsRepo } from "./find-widgets-by-ids.repo";
import type { GetWidgetFunnelPipelinesRepo } from "./get-widget-filterable-fields.interactor";
import type { FunnelWidgetDisplayOptions, WidgetDisplayOptions, WidgetDto, WidgetLayout } from "./widget.schema";
import type { Filter } from "@/core/base/base-get.schema";
import type { AggregationType, Prisma, WidgetGroupByType, EntityType } from "@/generated/prisma";

import { Action, Resource, StageKind, WidgetKind } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { BREAKPOINTS } from "@/constants/breakpoints";
import { getWidgetCalculatorRepo, getWidgetFunnelRepo } from "@/core/di";
import { ActivityWidgetDtoSchema, FunnelWidgetDtoSchema } from "./widget.schema";
import { activityFilterableFieldsForViewer } from "@/ee/messaging/activities/activity-filterable-fields";
import { normalizeFilters } from "@/core/base/filter-compat";

type WidgetDtoBase = {
  id: string;
  userId: string;
  companyId: string;
  name: string;
  layout: WidgetLayout | null;
  isTemplate: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export class PrismaWidgetRepo
  extends BaseRepository
  implements
    GetWidgetsRepo,
    UpsertWidgetRepo,
    DeleteWidgetRepo,
    GetCompanyWidgetsRepo,
    GetWidgetByIdRepo,
    UpdateWidgetLayoutsRepo,
    FindWidgetsByIdsRepo,
    GetWidgetFunnelPipelinesRepo
{
  private messagingSourcesEnabled = false;

  canReadPipelines() {
    return this.canAccess(Resource.pipelines);
  }

  async getFunnelPipelines() {
    if (!this.canReadPipelines()) return [];

    const pipelines = await this.prisma.pipeline.findMany({
      where: { companyId: this.companyId, archivedAt: null },
      select: { id: true, name: true, stages: { where: { kind: StageKind.open }, select: { id: true } } },
      orderBy: [{ position: "asc" }, { name: "asc" }],
    });

    return pipelines.map((pipeline) => ({
      id: pipeline.id,
      name: pipeline.name,
      openStageCount: pipeline.stages.length,
    }));
  }

  canReadMessagingSources() {
    return (
      this.hasPermission(Resource.inboxMessages, Action.readAll) ||
      this.hasPermission(Resource.inboxMessages, Action.readOwn)
    );
  }

  setMessagingSourcesEnabled(enabled: boolean) {
    this.messagingSourcesEnabled = enabled;
  }

  getActivityFilterableFields() {
    return Promise.resolve(
      activityFilterableFieldsForViewer({
        canAccess: (resource) => this.canAccess(resource),
        canReadMessages: this.messagingSourcesEnabled && this.canReadMessagingSources(),
        hasPermission: (resource, action) => this.hasPermission(resource, action),
      }),
    );
  }

  private get dtoSelect() {
    return {
      id: true,
      userId: true,
      companyId: true,
      name: true,
      kind: true,
      entityType: true,
      entityFilters: true,
      dealFilters: true,
      displayOptions: true,
      groupByType: true,
      groupByCustomColumnId: true,
      aggregationType: true,
      periodDays: true,
      pipelineId: true,
      timelineFilters: true,
      layout: true,
      isTemplate: true,
      createdAt: true,
      updatedAt: true,
    } as const;
  }

  private async toDto(
    row: Prisma.WidgetGetPayload<{ select: PrismaWidgetRepo["dtoSelect"] }>,
  ): Promise<WidgetDto | null> {
    const base = {
      id: row.id,
      userId: row.userId,
      companyId: row.companyId,
      name: row.name,
      layout: (row.layout as unknown as WidgetLayout | null) ?? null,
      isTemplate: row.isTemplate,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };

    switch (row.kind) {
      case WidgetKind.activityTimeline:
        return this.toActivityDto(row, base);
      case WidgetKind.funnel:
        return await this.toFunnelDto(row, base);
      case WidgetKind.chart:
        return await this.toChartDto(row, base);
      default: {
        const exhaustive: never = row.kind;
        return exhaustive;
      }
    }
  }

  private toActivityDto(
    row: Prisma.WidgetGetPayload<{ select: PrismaWidgetRepo["dtoSelect"] }>,
    base: WidgetDtoBase,
  ): WidgetDto | null {
    const timelineFilters = Array.isArray(row.timelineFilters)
      ? normalizeFilters(row.timelineFilters as unknown as Filter[])
      : (row.timelineFilters ?? []);
    const parsed = ActivityWidgetDtoSchema.safeParse({
      ...base,
      kind: WidgetKind.activityTimeline,
      timelineFilters,
      displayOptions: row.displayOptions ?? null,
    });

    return parsed.success ? parsed.data : null;
  }

  private async toFunnelDto(
    row: Prisma.WidgetGetPayload<{ select: PrismaWidgetRepo["dtoSelect"] }>,
    base: WidgetDtoBase,
  ): Promise<WidgetDto | null> {
    const funnel = {
      pipelineId: row.pipelineId,
      periodDays: row.periodDays,
    };
    const parsed = FunnelWidgetDtoSchema.safeParse({
      ...base,
      ...funnel,
      kind: WidgetKind.funnel,
      displayOptions: (row.displayOptions as unknown as FunnelWidgetDisplayOptions | null) ?? null,
      ...(await getWidgetFunnelRepo().calculateFunnelData(funnel)),
    });

    return parsed.success ? parsed.data : null;
  }

  private async toChartDto(
    row: Prisma.WidgetGetPayload<{ select: PrismaWidgetRepo["dtoSelect"] }>,
    base: WidgetDtoBase,
  ): Promise<WidgetDto | null> {
    const entityType = row.entityType as EntityType;
    const aggregationType = row.aggregationType as AggregationType;
    const entityFilters = normalizeFilters((row.entityFilters as unknown as Filter[] | null) ?? []);
    const dealFilters = normalizeFilters((row.dealFilters as unknown as Filter[] | null) ?? []);
    const chart = {
      ...base,
      kind: WidgetKind.chart,
      entityType,
      groupByType: row.groupByType as WidgetGroupByType,
      groupByCustomColumnId: row.groupByCustomColumnId,
      aggregationType,
      periodDays: row.periodDays,
      entityFilters,
      dealFilters,
      displayOptions: (row.displayOptions as unknown as WidgetDisplayOptions | null) ?? null,
    };

    return { ...chart, ...(await getWidgetCalculatorRepo().calculateWidgetData(chart)) };
  }

  async getWidgets() {
    const { id: userId, companyId } = this.user;

    const rows = await this.prisma.widget.findMany({
      where: {
        userId,
        companyId,
      },
      select: this.dtoSelect,
    });

    const widgets = await Promise.all(rows.map((row) => this.toDto(row)));
    return widgets.filter((widget): widget is WidgetDto => widget !== null);
  }

  @Transaction
  async upsertWidget(data: RepoArgs<UpsertWidgetRepo, "upsertWidget">) {
    const { id: userId, companyId } = this.user;
    const { data: widgetData } = data;

    const displayOptions = widgetData.displayOptions === undefined ? {} : { displayOptions: widgetData.displayOptions };

    const common = { userId, companyId, name: widgetData.name, isTemplate: widgetData.isTemplate };
    let widgetDataForDb: Prisma.WidgetUncheckedCreateInput;

    switch (widgetData.kind) {
      case WidgetKind.activityTimeline:
        widgetDataForDb = {
          ...common,
          kind: WidgetKind.activityTimeline,
          entityType: null,
          groupByType: null,
          groupByCustomColumnId: null,
          aggregationType: null,
          periodDays: null,
          pipelineId: null,
          timelineFilters: widgetData.timelineFilters ?? [],
          ...displayOptions,
        };
        break;
      case WidgetKind.funnel:
        widgetDataForDb = {
          ...common,
          kind: WidgetKind.funnel,
          entityType: null,
          groupByType: null,
          groupByCustomColumnId: null,
          aggregationType: null,
          pipelineId: widgetData.pipelineId,
          periodDays: widgetData.periodDays ?? null,
          ...displayOptions,
        };
        break;
      case WidgetKind.chart:
        widgetDataForDb = {
          ...common,
          kind: WidgetKind.chart,
          entityType: widgetData.entityType,
          entityFilters: widgetData.entityFilters ?? [],
          dealFilters: widgetData.dealFilters ?? [],
          ...displayOptions,
          groupByType: widgetData.groupByType ?? null,
          groupByCustomColumnId: widgetData.groupByCustomColumnId ?? null,
          aggregationType: widgetData.aggregationType,
          periodDays: widgetData.periodDays ?? null,
          pipelineId: null,
        };
        break;
      default: {
        const exhaustive: never = widgetData;
        return exhaustive;
      }
    }
    const widgetUpdateData: Prisma.WidgetUncheckedUpdateInput = {
      ...widgetDataForDb,
    };
    if (widgetData.kind === WidgetKind.activityTimeline && widgetData.timelineFilters === undefined)
      delete widgetUpdateData.timelineFilters;

    const row = await this.prisma.widget.upsert({
      where: { id: widgetData.id ?? "", companyId, userId },
      create: widgetDataForDb,
      update: widgetUpdateData,
      select: this.dtoSelect,
    });

    const widget = await this.toDto(row);
    if (!widget) throw new Error("Persisted widget configuration is invalid");
    return widget;
  }

  @Transaction
  async deleteWidget(id: string) {
    const { id: userId, companyId } = this.user;

    await this.prisma.widget.deleteMany({ where: { id, companyId, userId } });
  }

  async findIds(ids: Set<string>) {
    if (ids.size === 0) return new Set<string>();

    const { id: userId, companyId } = this.user;

    const widgets = await this.prisma.widget.findMany({
      where: { id: { in: Array.from(ids) }, companyId, userId },
      select: { id: true },
    });

    return new Set(widgets.map((widget) => widget.id));
  }

  async getCompanyWidgets() {
    const { companyId } = this.user;

    const widgets = await this.prisma.widget.findMany({
      where: {
        companyId,
        isTemplate: true,
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    return widgets.map((widget) => ({
      id: widget.id,
      kind: widget.kind,
      name: widget.name,
      firstName: widget.user.firstName,
      lastName: widget.user.lastName,
      avatarUrl: widget.user.avatarUrl,
    }));
  }

  async getWidgetKind(id: string) {
    const { id: userId, companyId } = this.user;
    const widget = await this.prisma.widget.findFirst({
      where: { id, companyId, OR: [{ userId }, { isTemplate: true }] },
      select: { kind: true },
    });

    return widget?.kind ?? null;
  }

  async getWidgetById(id: string) {
    const { id: userId, companyId } = this.user;

    const row = await this.prisma.widget.findFirst({
      where: {
        id,
        companyId,
        OR: [{ userId }, { isTemplate: true }],
      },
      select: this.dtoSelect,
    });

    return row ? this.toDto(row) : null;
  }

  @Transaction
  async updateWidgetLayouts(args: RepoArgs<UpdateWidgetLayoutsRepo, "updateWidgetLayouts">) {
    const { id: userId, companyId } = this.user;
    const widgetIds = new Set<string>();

    BREAKPOINTS.forEach((breakpoint) => args.layouts[breakpoint].forEach((layoutItem) => widgetIds.add(layoutItem.i)));

    const widgets = await this.prisma.widget.findMany({
      where: {
        id: { in: Array.from(widgetIds) },
        companyId,
        userId,
      },
      select: { id: true },
    });

    await Promise.all(
      widgets.map((widget) => {
        const layout: WidgetLayout = {
          xs: args.layouts.xs.find((l) => l.i === widget.id),
          sm: args.layouts.sm.find((l) => l.i === widget.id),
          md: args.layouts.md.find((l) => l.i === widget.id),
          lg: args.layouts.lg.find((l) => l.i === widget.id),
        };

        return this.prisma.widget.update({
          where: { id: widget.id, companyId, userId },
          data: { layout },
        });
      }),
    );
  }
}
