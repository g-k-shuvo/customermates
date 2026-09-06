import type {
  WidgetForCalculation,
  EntityForGrouping,
  DealRecord,
  GroupedDealAggregate,
  WinRateRow,
  DurationRow,
  PeriodWindow,
  StagePosition,
  PipelinePosition,
  FunnelPipeline,
} from "./widget-calculator.types";
import type { FunnelStageEntry } from "../widget-funnel";
import type { Filter } from "@/core/base/base-get.schema";

import type { Prisma } from "@/generated/prisma";
import { Action, DealStatus, EntityType, Resource, StageKind, WidgetGroupByType } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { getContactRepo, getOrganizationRepo, getDealRepo, getServiceRepo, getTaskRepo } from "@/core/di";

const CUSTOM_FIELD_RELATION: Record<EntityType, keyof Prisma.CustomFieldValueWhereInput> = {
  [EntityType.contact]: "contact",
  [EntityType.organization]: "organization",
  [EntityType.deal]: "deal",
  [EntityType.service]: "service",
  [EntityType.task]: "task",
};

type RawDurationRow = {
  key: string | null;
  isTotal: number;
  sampleSize: number;
  meanDays: number | null;
  medianDays: number | null;
};

type RawFunnelStageEntryRow = {
  dealId: string;
  stageId: string;
  enteredAt: Date;
  isWon: boolean;
};

type GroupingSql = {
  keySelect: string;
  totalFlag: string;
  groupClause: string;
};

const UNGROUPED_SQL: GroupingSql = {
  keySelect: "NULL::text",
  totalFlag: "1",
  groupClause: "",
};

function groupingSql(keyExpression: string): GroupingSql {
  return {
    keySelect: keyExpression,
    totalFlag: `GROUPING(${keyExpression})::int`,
    groupClause: `GROUP BY GROUPING SETS ((${keyExpression}), ())`,
  };
}

class SqlParams {
  private readonly collected: unknown[] = [];

  add(value: unknown): string {
    this.collected.push(value);

    return `$${this.collected.length}`;
  }

  values(): unknown[] {
    return this.collected;
  }
}

function toDurationRow(row: RawDurationRow): DurationRow {
  return {
    key: row.key,
    isTotal: row.isTotal === 1,
    sampleSize: Number(row.sampleSize),
    meanDays: row.meanDays === null ? null : Number(row.meanDays),
    medianDays: row.medianDays === null ? null : Number(row.medianDays),
  };
}

export class WidgetDataFetcher extends BaseRepository {
  async getEntityCount(entityType: EntityType, filters: Filter[] | undefined): Promise<number> {
    switch (entityType) {
      case EntityType.contact:
        return await getContactRepo().getCount({ filters });
      case EntityType.organization:
        return await getOrganizationRepo().getCount({ filters });
      case EntityType.deal:
        return await getDealRepo().getCount({ filters });
      case EntityType.service:
        return await getServiceRepo().getCount({ filters });
      case EntityType.task:
        return await getTaskRepo().getCount({ filters });
    }
  }

  private async entityWhere(entityType: EntityType, filters: Filter[] | undefined): Promise<Record<string, unknown>> {
    switch (entityType) {
      case EntityType.contact:
        return (await getContactRepo().buildQueryArgs({ filters }, this.accessWhere("contact"))).where;
      case EntityType.organization:
        return (await getOrganizationRepo().buildQueryArgs({ filters }, this.accessWhere("organization"))).where;
      case EntityType.deal:
        return (await getDealRepo().buildQueryArgs({ filters }, this.accessWhere("deal"))).where;
      case EntityType.service:
        return (await getServiceRepo().buildQueryArgs({ filters }, this.accessWhere("service"))).where;
      case EntityType.task:
        return (await getTaskRepo().buildQueryArgs({ filters }, this.accessWhere("task"))).where;
    }
  }

  private async boundedDealWhere(widget: WidgetForCalculation): Promise<Prisma.DealWhereInput> {
    const { companyId } = this;
    const dealWhere = (await getDealRepo().buildQueryArgs({ filters: widget.dealFilters }, this.accessWhere("deal")))
      .where;
    const entityWhere = await this.entityWhere(widget.entityType, widget.entityFilters);

    switch (widget.entityType) {
      case EntityType.contact:
        return { companyId, AND: [dealWhere, { contacts: { some: { contact: entityWhere } } }] };
      case EntityType.organization:
        return { companyId, AND: [dealWhere, { organizations: { some: { organization: entityWhere } } }] };
      case EntityType.service:
        return { companyId, AND: [dealWhere, { services: { some: { service: entityWhere } } }] };
      case EntityType.deal:
        return { companyId, AND: [dealWhere, entityWhere as Prisma.DealWhereInput] };
      case EntityType.task:
        return { companyId, id: { in: [] } };
    }
  }

  async sumDealField(
    widget: WidgetForCalculation,
    field: "totalValue" | "totalQuantity" | "weightedValue",
  ): Promise<number> {
    const where = await this.boundedDealWhere(widget);
    const result = await this.prisma.deal.aggregate({
      where,
      _sum: { totalValue: true, totalQuantity: true, weightedValue: true },
    });
    return result._sum[field] ?? 0;
  }

  async getStagePositions(): Promise<StagePosition[]> {
    const stages = await this.prisma.pipelineStage.findMany({
      where: { companyId: this.companyId },
      select: {
        id: true,
        name: true,
        position: true,
        pipelineId: true,
        pipeline: { select: { position: true } },
      },
      orderBy: [{ pipeline: { position: "asc" } }, { position: "asc" }, { name: "asc" }],
    });

    return stages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      position: stage.position,
      pipelineId: stage.pipelineId,
      pipelinePosition: stage.pipeline.position,
    }));
  }

  async getPipelinePositions(): Promise<PipelinePosition[]> {
    return await this.prisma.pipeline.findMany({
      where: { companyId: this.companyId },
      select: { id: true, name: true, position: true },
      orderBy: [{ position: "asc" }, { name: "asc" }],
    });
  }

  async groupDealsByPipelinePosition(
    widget: WidgetForCalculation,
    groupByType: WidgetGroupByType,
  ): Promise<GroupedDealAggregate[]> {
    const where = await this.boundedDealWhere(widget);
    const _count = { _all: true } as const;
    const _sum = { totalValue: true, totalQuantity: true, weightedValue: true } as const;

    if (groupByType === WidgetGroupByType.dealPipeline) {
      const rows = await this.prisma.deal.groupBy({ by: ["pipelineId"], where, _count, _sum });
      return rows.map((row) => this.toGroupedDealAggregate(row.pipelineId, row));
    }

    const rows = await this.prisma.deal.groupBy({ by: ["stageId"], where, _count, _sum });
    return rows.map((row) => this.toGroupedDealAggregate(row.stageId, row));
  }

  private toGroupedDealAggregate(
    key: string | null,
    row: {
      _count: { _all: number };
      _sum: { totalValue: number | null; totalQuantity: number | null; weightedValue: number | null };
    },
  ): GroupedDealAggregate {
    return {
      key,
      count: row._count._all,
      totalValue: row._sum.totalValue ?? 0,
      totalQuantity: row._sum.totalQuantity ?? 0,
      weightedValue: row._sum.weightedValue ?? 0,
    };
  }

  async getWinRateRows(widget: WidgetForCalculation, window: PeriodWindow): Promise<WinRateRow[]> {
    const base = await this.boundedDealWhere(widget);
    const where: Prisma.DealWhereInput = {
      companyId: this.companyId,
      AND: [
        base,
        { status: { in: [DealStatus.won, DealStatus.lost] } },
        { closedAt: { gte: window.from, lt: window.to } },
      ],
    };
    const _count = { _all: true } as const;
    const _sum = { totalValue: true } as const;

    if (widget.groupByType === WidgetGroupByType.dealStage) {
      const rows = await this.prisma.deal.groupBy({ by: ["stageId", "status"], where, _count, _sum });
      return this.foldWinRateRows(rows.map((row) => ({ key: row.stageId, ...this.closedSlice(row) })));
    }

    if (widget.groupByType === WidgetGroupByType.dealPipeline) {
      const rows = await this.prisma.deal.groupBy({ by: ["pipelineId", "status"], where, _count, _sum });
      return this.foldWinRateRows(rows.map((row) => ({ key: row.pipelineId, ...this.closedSlice(row) })));
    }

    const rows = await this.prisma.deal.groupBy({ by: ["status"], where, _count, _sum });
    return this.foldWinRateRows(rows.map((row) => ({ key: null, ...this.closedSlice(row) })));
  }

  private closedSlice(row: { status: DealStatus; _count: { _all: number }; _sum: { totalValue: number | null } }): {
    status: DealStatus;
    count: number;
    value: number;
  } {
    return { status: row.status, count: row._count._all, value: row._sum.totalValue ?? 0 };
  }

  private foldWinRateRows(
    slices: Array<{ key: string | null; status: DealStatus; count: number; value: number }>,
  ): WinRateRow[] {
    const byKey = new Map<string, WinRateRow>();

    for (const slice of slices) {
      const mapKey = slice.key ?? "";
      const row = byKey.get(mapKey) ?? { key: slice.key, wonCount: 0, lostCount: 0, wonValue: 0, lostValue: 0 };

      if (slice.status === DealStatus.won) {
        row.wonCount += slice.count;
        row.wonValue += slice.value;
      }

      if (slice.status === DealStatus.lost) {
        row.lostCount += slice.count;
        row.lostValue += slice.value;
      }

      byKey.set(mapKey, row);
    }

    return Array.from(byKey.values());
  }

  async getSalesCycleRows(widget: WidgetForCalculation, window: PeriodWindow): Promise<DurationRow[]> {
    const grouping = this.dealGrouping(widget.groupByType);
    const cycleDays = '(EXTRACT(EPOCH FROM (COALESCE(d."wonAt", d."closedAt") - d."createdAt")) / 86400.0)';
    const params = new SqlParams();

    const text = `
      SELECT ${grouping.keySelect} AS "key",
             ${grouping.totalFlag} AS "isTotal",
             COUNT(*)::int AS "sampleSize",
             AVG(${cycleDays})::float8 AS "meanDays",
             (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${cycleDays}))::float8 AS "medianDays"
      FROM "Deal" d
      WHERE d."companyId" = ${params.add(this.companyId)}
        AND d."status" = ${params.add(DealStatus.won)}::"DealStatus"
        AND d."closedAt" >= ${params.add(window.from)}
        AND d."closedAt" < ${params.add(window.to)}
        AND COALESCE(d."wonAt", d."closedAt") >= d."createdAt"
        AND ${this.dealAccessSql(params)}
      ${grouping.groupClause}`;

    const rows = await this.prisma.$queryRawUnsafe<RawDurationRow[]>(text, ...params.values());

    return rows.map(toDurationRow);
  }

  async getStageDurationRows(widget: WidgetForCalculation, window: PeriodWindow): Promise<DurationRow[]> {
    const groupsByPipeline = widget.groupByType === WidgetGroupByType.dealPipeline;
    const grouping = this.stageHistoryGrouping(widget.groupByType);
    const stageJoin = groupsByPipeline ? 'LEFT JOIN "PipelineStage" s ON s."id" = h."toStageId"' : "";
    const stageDays = '(h."durationSeconds" / 86400.0)';
    const params = new SqlParams();

    const text = `
      SELECT ${grouping.keySelect} AS "key",
             ${grouping.totalFlag} AS "isTotal",
             COUNT(*)::int AS "sampleSize",
             AVG(${stageDays})::float8 AS "meanDays",
             (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${stageDays}))::float8 AS "medianDays"
      FROM "DealStageHistory" h
      JOIN "Deal" d ON d."id" = h."dealId"
      ${stageJoin}
      WHERE h."companyId" = ${params.add(this.companyId)}
        AND h."enteredAt" >= ${params.add(window.from)}
        AND h."enteredAt" < ${params.add(window.to)}
        AND h."durationSeconds" IS NOT NULL
        AND ${this.dealAccessSql(params)}
      ${grouping.groupClause}`;

    const rows = await this.prisma.$queryRawUnsafe<RawDurationRow[]>(text, ...params.values());

    return rows.map(toDurationRow);
  }

  async getFunnelPipeline(pipelineId: string): Promise<FunnelPipeline | null> {
    const pipeline = await this.prisma.pipeline.findFirst({
      where: { id: pipelineId, companyId: this.companyId },
      select: {
        name: true,
        stages: {
          where: { kind: StageKind.open },
          select: { id: true, name: true, position: true },
          orderBy: [{ position: "asc" }, { name: "asc" }],
        },
      },
    });

    return pipeline ? { name: pipeline.name, stages: pipeline.stages } : null;
  }

  async getFunnelStageEntries(pipelineId: string, window: PeriodWindow): Promise<FunnelStageEntry[]> {
    const params = new SqlParams();

    const text = `
      SELECT h."dealId" AS "dealId",
             h."toStageId" AS "stageId",
             h."enteredAt" AS "enteredAt",
             (d."status" = ${params.add(DealStatus.won)}::"DealStatus") AS "isWon"
      FROM "DealStageHistory" h
      JOIN "Deal" d ON d."id" = h."dealId"
      JOIN "PipelineStage" s ON s."id" = h."toStageId"
      WHERE h."companyId" = ${params.add(this.companyId)}
        AND s."companyId" = ${params.add(this.companyId)}
        AND s."pipelineId" = ${params.add(pipelineId)}
        AND s."kind" = ${params.add(StageKind.open)}::"StageKind"
        AND h."enteredAt" >= ${params.add(window.from)}
        AND h."enteredAt" < ${params.add(window.to)}
        AND ${this.dealAccessSql(params)}`;

    const rows = await this.prisma.$queryRawUnsafe<RawFunnelStageEntryRow[]>(text, ...params.values());

    return rows.map((row) => ({
      dealId: row.dealId,
      stageId: row.stageId,
      enteredAt: row.enteredAt,
      isWon: row.isWon,
    }));
  }

  private dealGrouping(groupByType: WidgetGroupByType): GroupingSql {
    if (groupByType === WidgetGroupByType.dealStage) return groupingSql('d."stageId"');
    if (groupByType === WidgetGroupByType.dealPipeline) return groupingSql('d."pipelineId"');
    return UNGROUPED_SQL;
  }

  private stageHistoryGrouping(groupByType: WidgetGroupByType): GroupingSql {
    if (groupByType === WidgetGroupByType.dealStage) return groupingSql('h."toStageId"');
    if (groupByType === WidgetGroupByType.dealPipeline) return groupingSql('s."pipelineId"');
    return UNGROUPED_SQL;
  }

  private dealAccessSql(params: SqlParams): string {
    if (this.hasPermission(Resource.deals, Action.readAll)) return "TRUE";

    if (this.hasPermission(Resource.deals, Action.readOwn))
      return `EXISTS (SELECT 1 FROM "DealUser" du WHERE du."dealId" = d."id" AND du."userId" = ${params.add(this.userId)})`;

    return "FALSE";
  }

  async getDealsForEntityType(widget: WidgetForCalculation): Promise<DealRecord[]> {
    const { entityType } = widget;
    if (entityType === EntityType.task) return [];

    const where = await this.boundedDealWhere(widget);
    const entityWhere = await this.entityWhere(entityType, widget.entityFilters);

    const select: Prisma.DealSelect = {
      id: true,
      name: true,
      totalValue: true,
      totalQuantity: true,
      weightedValue: true,
    };

    if (entityType === EntityType.contact) {
      select.contacts = {
        where: { contact: entityWhere as Prisma.ContactWhereInput },
        select: { contact: { select: { id: true, firstName: true, lastName: true } } },
      };
    }

    if (entityType === EntityType.organization) {
      select.organizations = {
        where: { organization: entityWhere as Prisma.OrganizationWhereInput },
        select: { organization: { select: { id: true, name: true } } },
      };
    }

    if (entityType === EntityType.service) {
      select.services = {
        where: { service: entityWhere as Prisma.ServiceWhereInput },
        select: { quantity: true, service: { select: { id: true, name: true, amount: true } } },
      };
    }

    const res = (await this.prisma.deal.findMany({ where, select } as Prisma.DealFindManyArgs)) as Array<
      Record<string, unknown>
    >;

    return res.map((deal) => ({
      id: deal.id as string,
      name: deal.name as string,
      totalValue: deal.totalValue as number,
      totalQuantity: deal.totalQuantity as number,
      weightedValue: deal.weightedValue as number | null,
      contacts: deal.contacts as DealRecord["contacts"],
      organizations: deal.organizations as DealRecord["organizations"],
      services: deal.services as DealRecord["services"],
    }));
  }

  async countByCustomColumn(
    entityType: EntityType,
    filters: Filter[] | undefined,
    columnId: string,
  ): Promise<Array<{ value: string | null; count: number }>> {
    const entityWhere = await this.entityWhere(entityType, filters);
    const relation = CUSTOM_FIELD_RELATION[entityType];

    const grouped = await this.prisma.customFieldValue.groupBy({
      by: ["value"],
      where: {
        companyId: this.companyId,
        columnId,
        entityType,
        [relation]: entityWhere,
      } as Prisma.CustomFieldValueWhereInput,
      _count: { _all: true },
    });

    const noValueCount = await this.countEntitiesWithoutColumn(entityType, entityWhere, columnId);

    const result = grouped.map((g) => ({ value: g.value, count: g._count._all }));
    if (noValueCount > 0) result.push({ value: null, count: noValueCount });

    return result;
  }

  private async countEntitiesWithoutColumn(
    entityType: EntityType,
    entityWhere: Record<string, unknown>,
    columnId: string,
  ): Promise<number> {
    const customFieldValues = { none: { columnId } };

    switch (entityType) {
      case EntityType.contact:
        return this.prisma.contact.count({
          where: { ...(entityWhere as Prisma.ContactWhereInput), customFieldValues },
        });
      case EntityType.organization:
        return this.prisma.organization.count({
          where: { ...(entityWhere as Prisma.OrganizationWhereInput), customFieldValues },
        });
      case EntityType.deal:
        return this.prisma.deal.count({ where: { ...(entityWhere as Prisma.DealWhereInput), customFieldValues } });
      case EntityType.service:
        return this.prisma.service.count({
          where: { ...(entityWhere as Prisma.ServiceWhereInput), customFieldValues },
        });
      case EntityType.task:
        return this.prisma.task.count({ where: { ...(entityWhere as Prisma.TaskWhereInput), customFieldValues } });
    }
  }

  async getEntitiesForGrouping(entityType: EntityType, filters: Filter[] | undefined): Promise<EntityForGrouping[]> {
    switch (entityType) {
      case EntityType.contact: {
        const contacts = await this.getContacts(filters);
        return contacts.map((c) => ({ id: c.id, firstName: c.firstName, lastName: c.lastName }));
      }
      case EntityType.organization: {
        const organizations = await this.getOrganizations(filters);
        return organizations.map((o) => ({ id: o.id, name: o.name }));
      }
      case EntityType.deal: {
        const deals = await this.getDealsList(filters);
        return deals.map((d) => ({ id: d.id, name: d.name }));
      }
      case EntityType.service: {
        const services = await this.getServices(filters);
        return services.map((s) => ({ id: s.id, name: s.name }));
      }
      case EntityType.task: {
        const tasks = await this.getTasks(filters);
        return tasks.map((t) => ({ id: t.id, name: t.name }));
      }
    }
  }

  private async getContacts(filters: Filter[] | undefined) {
    const { where, orderBy } = await getContactRepo().buildQueryArgs({ filters }, this.accessWhere("contact"));
    return await this.prisma.contact.findMany({
      where,
      orderBy,
      select: { id: true, firstName: true, lastName: true },
    });
  }

  private async getOrganizations(filters: Filter[] | undefined) {
    const { where, orderBy } = await getOrganizationRepo().buildQueryArgs(
      { filters },
      this.accessWhere("organization"),
    );
    return await this.prisma.organization.findMany({ where, orderBy, select: { id: true, name: true } });
  }

  private async getDealsList(filters: Filter[] | undefined) {
    const { where, orderBy } = await getDealRepo().buildQueryArgs({ filters }, this.accessWhere("deal"));
    return await this.prisma.deal.findMany({ where, orderBy, select: { id: true, name: true } });
  }

  private async getServices(filters: Filter[] | undefined) {
    const { where, orderBy } = await getServiceRepo().buildQueryArgs({ filters }, this.accessWhere("service"));
    return await this.prisma.service.findMany({ where, orderBy, select: { id: true, name: true } });
  }

  private async getTasks(filters: Filter[] | undefined) {
    const { where, orderBy } = await getTaskRepo().buildQueryArgs({ filters }, this.accessWhere("task"));
    return await this.prisma.task.findMany({ where, orderBy, select: { id: true, name: true } });
  }
}
