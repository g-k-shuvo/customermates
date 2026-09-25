import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { RepoArgs } from "@/core/utils/types";
import type { GetDealWeightingColumnRepo } from "@/features/company/get-deal-weighting-column.repo";
import type { GetWidgetFilterableFieldsDealRepo } from "../widget/get-widget-filterable-fields.interactor";
import type { GetCompanyWideDealRepo } from "./get-company-wide-deal.repo";
import type { CreateDealRepo } from "./upsert/create-deal.repo";
import type { UpdateDealRepo } from "./upsert/update-deal.repo";
import type { GetDealsRepo } from "./get/get-deals.interactor";
import type { GetConfigurationRepo } from "@/core/base/base-get-configuration.interactor";
import type { GetDealByIdRepo } from "./get/get-deal-by-id.interactor";
import type { DeleteDealRepo } from "./delete/delete-deal.repo";
import type { MarkDealWonRepo } from "./close/mark-deal-won.repo";
import type { MarkDealLostRepo } from "./close/mark-deal-lost.repo";
import type { ReopenDealRepo } from "./close/reopen-deal.repo";
import type { FindDealPipelinesRepo } from "./find-deal-pipelines.repo";
import type { FindDealsByIdsRepo } from "./find-deals-by-ids.repo";
import type { DealStageHistoryRepo } from "./listener/deal-stage-history.listener";
import type { ModifyRelationDealRepo } from "@/features/relations/modify-entity-relation.interactor";

import { DealStatus, EntityType, Resource, StageKind } from "@/generated/prisma";

import type { Prisma } from "@/generated/prisma";
import type { ExportPageParams, ExportRecordsRepo } from "@/core/base/base-export-records-page.interactor";

import { type DealDto } from "./deal.schema";

import { BaseRepository } from "@/core/base/base-repository";
import { Transaction } from "@/core/decorators/transaction.decorator";
import {
  STAGE_GROUPING_FIELD,
  STAGE_GROUPING_KEY,
  type Filter,
  type GetQueryParams,
} from "@/core/base/base-get.schema";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import {
  customSelectGroupables,
  dateGroupables,
  enumGroupables,
  relationGroupables,
  stageGroupable,
} from "@/core/base/grouping/groupable-field";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { getCustomColumnRepo, getPipelineRepo } from "@/core/di";
import { computeWeightedValue, effectiveProbability, readOptionWeights } from "./deal-weighting";
import { computeRottingAt, isRotting } from "./deal-rotting";
import { dealStageMove, lostTransition, reopenTransition, wonTransition } from "./close/closing-transition";

const ROTTING_SORT_FIELD = "rottingAt";

const DEAL_STATUS_VALUES = new Set<string>(Object.values(DealStatus));

const SELECTION_OPERATORS = [FilterOperatorKey.in, FilterOperatorKey.notIn];

const DEAL_STATUS_FILTER_FIELD: string = FilterFieldKey.dealStatus;

const ROTTING_FILTER_FIELD: string = FilterFieldKey.rotting;

const NEXT_ACTIVITY_FILTER_FIELD: string = FilterFieldKey.nextActivity;

const PIPELINE_FILTER_FIELD: string = FilterFieldKey.pipelineId;

const PIPELINE_SELECTION_OPERATORS: string[] = [FilterOperatorKey.equals, FilterOperatorKey.in];

function partitionDealFilters(filters: Filter[] | undefined) {
  const dealStatus: Filter[] = [];
  const rotting: Filter[] = [];
  const nextActivity: Filter[] = [];
  const rest: Filter[] = [];

  for (const filter of filters ?? []) {
    if (filter.field === DEAL_STATUS_FILTER_FIELD) dealStatus.push(filter);
    else if (filter.field === ROTTING_FILTER_FIELD) rotting.push(filter);
    else if (filter.field === NEXT_ACTIVITY_FILTER_FIELD) nextActivity.push(filter);
    else rest.push(filter);
  }

  return { dealStatus, rotting, nextActivity, rest };
}

function selectedFilterValues(filter: Filter): string[] {
  const raw: unknown = "value" in filter ? filter.value : undefined;

  return (Array.isArray(raw) ? (raw as unknown[]) : [raw]).flatMap((value) =>
    typeof value === "string" ? [value] : [],
  );
}

function selectedPipelineId(filters: Filter[] | undefined): string | null {
  for (const filter of filters ?? []) {
    if (filter.field !== PIPELINE_FILTER_FIELD) continue;
    if (!PIPELINE_SELECTION_OPERATORS.includes(filter.operator)) continue;

    const values = selectedFilterValues(filter);

    if (values.length === 1) return values[0];
  }

  return null;
}

function dealStatusClause(filter: Filter): Prisma.DealWhereInput | null {
  if (!SELECTION_OPERATORS.includes(filter.operator)) return null;

  const values = selectedFilterValues(filter).filter((value): value is DealStatus => DEAL_STATUS_VALUES.has(value));

  if (values.length === 0) return null;

  return filter.operator === FilterOperatorKey.in ? { status: { in: values } } : { status: { notIn: values } };
}

function wantsSelectedBoolean(filter: Filter): boolean | null {
  if (!SELECTION_OPERATORS.includes(filter.operator)) return null;

  const selected = new Set(selectedFilterValues(filter).filter((value) => value === "true" || value === "false"));

  if (selected.size !== 1) return null;

  return (filter.operator === FilterOperatorKey.in) === selected.has("true");
}

function rottingClause(filter: Filter, now: Date): Prisma.DealWhereInput | null {
  const wantsRotting = wantsSelectedBoolean(filter);

  if (wantsRotting === null) return null;

  return wantsRotting ? { rottingAt: { lte: now } } : { OR: [{ rottingAt: null }, { rottingAt: { gt: now } }] };
}

function existingAndClauses(where: Prisma.DealWhereInput): Prisma.DealWhereInput[] {
  if (!where.AND) return [];

  return Array.isArray(where.AND) ? where.AND : [where.AND];
}

function rottingFirstOrderBy(orderBy: Record<string, unknown>[]): Record<string, unknown>[] {
  return orderBy.map((clause) =>
    Object.fromEntries(
      Object.entries(clause).map(([field, direction]) =>
        field === ROTTING_SORT_FIELD ? [field, direction === "asc" ? "desc" : "asc"] : [field, direction],
      ),
    ),
  );
}

export class PrismaDealRepo
  extends BaseRepository<Prisma.DealWhereInput>
  implements
    CreateDealRepo,
    UpdateDealRepo,
    GetDealsRepo,
    GetConfigurationRepo,
    GetDealByIdRepo,
    DeleteDealRepo,
    MarkDealWonRepo,
    MarkDealLostRepo,
    ReopenDealRepo,
    GetWidgetFilterableFieldsDealRepo,
    FindDealPipelinesRepo,
    FindDealsByIdsRepo,
    GetCompanyWideDealRepo,
    DealStageHistoryRepo,
    ModifyRelationDealRepo,
    ExportRecordsRepo<DealDto>
{
  constructor(private readonly companyRepo: GetDealWeightingColumnRepo) {
    super();
  }

  private get userScopedSelect() {
    return {
      id: true,
      name: true,
      totalValue: true,
      totalQuantity: true,
      weightedValue: true,
      notes: true,
      pipelineId: true,
      stageId: true,
      status: true,
      expectedCloseDate: true,
      probability: true,
      stageEnteredAt: true,
      rottingAt: true,
      lostReasonId: true,
      lostReason: { select: { name: true } },
      lostNotes: true,
      wonAt: true,
      lostAt: true,
      closedAt: true,
      createdAt: true,
      updatedAt: true,
      organizations: {
        where: { organization: this.accessWhere("organization") },
        select: { organization: { select: { id: true, name: true } } },
      },
      users: {
        where: { user: { is: this.accessWhere("user") } },
        select: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, email: true } } },
      },
      contacts: {
        where: { contact: this.accessWhere("contact") },
        select: {
          contact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
            },
          },
        },
      },
      services: {
        where: { service: this.accessWhere("service") },
        select: {
          service: { select: { id: true, name: true, amount: true } },
          serviceId: true,
          quantity: true,
        },
      },
      tasks: {
        where: { task: this.accessWhere("task") },
        select: {
          task: {
            select: {
              id: true,
              name: true,
              type: true,
              activityKind: true,
              dueAt: true,
              completedAt: true,
            },
          },
        },
      },
      customFieldValues: {
        select: {
          columnId: true,
          value: true,
        },
      },
    } as const;
  }

  private get companyScopedSelect() {
    return {
      ...this.userScopedSelect,
      organizations: { select: this.userScopedSelect.organizations.select },
      users: { select: this.userScopedSelect.users.select },
      contacts: { select: this.userScopedSelect.contacts.select },
      services: { select: this.userScopedSelect.services.select },
      tasks: { select: this.userScopedSelect.tasks.select },
    };
  }

  getSearchableFields() {
    return [{ field: "name" }];
  }

  getSortableFields() {
    return [
      { field: "name", resolvedFields: ["name"] },
      { field: "totalValue", resolvedFields: ["totalValue"] },
      { field: "totalQuantity", resolvedFields: ["totalQuantity"] },
      { field: "weightedValue", resolvedFields: ["weightedValue"] },
      { field: "expectedCloseDate", resolvedFields: ["expectedCloseDate"] },
      { field: ROTTING_SORT_FIELD, resolvedFields: [ROTTING_SORT_FIELD] },
      { field: "lostReason", resolvedFields: ["lostReason.name"] },
      { field: "createdAt", resolvedFields: ["createdAt"] },
      { field: "updatedAt", resolvedFields: ["updatedAt"] },
    ];
  }

  private scheduledActivityWhere(): Prisma.TaskWhereInput {
    return { ...this.accessWhere("task"), completedAt: null, dueAt: { not: null } };
  }

  private nextActivityClause(filter: Filter): Prisma.DealWhereInput | null {
    const wantsScheduled = wantsSelectedBoolean(filter);

    if (wantsScheduled === null) return null;

    const scheduled = { task: this.scheduledActivityWhere() };

    return wantsScheduled ? { tasks: { some: scheduled } } : { tasks: { none: scheduled } };
  }

  override async buildQueryArgs(params: GetQueryParams, baseWhere: Prisma.DealWhereInput = {}) {
    const { dealStatus, rotting, nextActivity, rest } = partitionDealFilters(params.filters);
    const args = await super.buildQueryArgs({ ...params, filters: rest }, baseWhere);
    const now = new Date();
    const clauses = [
      ...dealStatus.flatMap((filter) => {
        const clause = dealStatusClause(filter);

        return clause ? [clause] : [];
      }),
      ...rotting.flatMap((filter) => {
        const clause = rottingClause(filter, now);

        return clause ? [clause] : [];
      }),
      ...nextActivity.flatMap((filter) => {
        const clause = this.nextActivityClause(filter);

        return clause ? [clause] : [];
      }),
    ];

    const where =
      clauses.length === 0 ? args.where : { ...args.where, AND: [...existingAndClauses(args.where), ...clauses] };

    return { ...args, where, orderBy: rottingFirstOrderBy(args.orderBy) };
  }

  async getFilterableFields() {
    if (!this.canAccess(Resource.deals)) return [];

    const customFields = await getCustomColumnRepo().getFilterableCustomFields(EntityType.deal);

    const filterFields = [];

    filterFields.push({
      field: FilterFieldKey.name,
      operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.name],
    });

    if (this.canAccess(Resource.contacts)) {
      filterFields.push({
        field: FilterFieldKey.contactIds,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.contactIds],
      });
    }

    if (this.canAccess(Resource.organizations)) {
      filterFields.push({
        field: FilterFieldKey.organizationIds,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.organizationIds],
      });
    }

    if (this.canAccess(Resource.services)) {
      filterFields.push({
        field: FilterFieldKey.serviceIds,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.serviceIds],
      });
    }

    if (this.canAccess(Resource.tasks)) {
      filterFields.push({
        field: FilterFieldKey.taskIds,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.taskIds],
      });

      filterFields.push({
        field: FilterFieldKey.nextActivity,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.nextActivity],
      });
    }

    if (this.canAccess(Resource.company)) {
      filterFields.push({
        field: FilterFieldKey.lostReasonId,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.lostReasonId],
      });
    }

    return [
      ...filterFields,
      ...customFields,
      {
        field: FilterFieldKey.userIds,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.userIds],
      },
      { field: FilterFieldKey.updatedAt, operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.updatedAt] },
      { field: FilterFieldKey.createdAt, operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.createdAt] },
      { field: FilterFieldKey.dealStatus, operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.dealStatus] },
      { field: FilterFieldKey.rotting, operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.rotting] },
      { field: FilterFieldKey.stageId, operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.stageId] },
      { field: FilterFieldKey.pipelineId, operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.pipelineId] },
    ];
  }

  async getGroupableFields(customColumns?: readonly CustomColumnDto[], filters?: readonly Filter[]) {
    if (!this.canAccess(Resource.deals)) return [];

    return [
      stageGroupable({
        model: "deal",
        field: STAGE_GROUPING_KEY,
        column: STAGE_GROUPING_FIELD,
        labelKey: "DataView.groupByStage",
        stages: await this.getGroupOptions(filters ? [...filters] : undefined),
      }),
      ...customSelectGroupables(EntityType.deal, customColumns ?? (await this.getCustomColumns())),
      ...relationGroupables("deal", {
        contactIds: this.canAccess(Resource.contacts),
        organizationIds: this.canAccess(Resource.organizations),
        serviceIds: this.canAccess(Resource.services),
        taskIds: this.canAccess(Resource.tasks),
        userIds: this.canAccess(Resource.users),
      }),
      ...enumGroupables("deal", {}),
      ...dateGroupables("deal", { createdAt: true, updatedAt: true }),
    ];
  }

  async getDealById(id: string) {
    const deal = await this.prisma.deal.findFirst({
      where: {
        id,
        ...this.accessWhere("deal"),
      },
      select: this.userScopedSelect,
    });

    if (!deal) return null;

    return this.toDto(deal);
  }

  async getOrThrowCompanyWide(id: string) {
    const { companyId } = this.user;

    const deal = await this.prisma.deal.findFirstOrThrow({
      where: { id, companyId },
      select: this.companyScopedSelect,
    });

    return this.toDto(deal);
  }

  async getManyOrThrowCompanyWide(ids: string[]) {
    if (ids.length === 0) return [];

    const { companyId } = this.user;
    const uniqueIds = [...new Set(ids)];

    const deals = await this.prisma.deal.findMany({
      where: { id: { in: uniqueIds }, companyId },
      select: this.companyScopedSelect,
      orderBy: { id: "asc" },
    });

    if (deals.length !== uniqueIds.length) throw new Error("One or more deals not found");

    return deals.map((deal) => this.toDto(deal));
  }

  private toDto(deal: Prisma.DealGetPayload<{ select: PrismaDealRepo["userScopedSelect"] }>): DealDto {
    const { lostReason, ...dealFields } = deal;

    return {
      ...dealFields,
      lostReasonName: lostReason?.name ?? null,
      isRotting: isRotting(deal.rottingAt, new Date()),
      organizations: deal.organizations.map((it) => it.organization),
      users: deal.users.map((it) => it.user),
      contacts: deal.contacts.map((it) => it.contact),
      services: deal.services.map((it) => ({ ...it.service, quantity: it.quantity })),
      tasks: deal.tasks.map((it) => it.task),
    };
  }

  async getItems(params: GetQueryParams) {
    return this.list({
      model: "deal",
      baseWhere: this.accessWhere("deal"),
      select: this.userScopedSelect,
      params,
      map: (deal: Prisma.DealGetPayload<{ select: PrismaDealRepo["userScopedSelect"] }>) => this.toDto(deal),
    });
  }

  async getCount(params: GetQueryParams) {
    const { where } = await this.buildQueryArgs(params, this.accessWhere("deal"));

    return this.prisma.deal.count({ where });
  }

  private exportWhere(selectedIds?: string[]): Prisma.DealWhereInput {
    const scoped = this.accessWhere("deal");

    return selectedIds && selectedIds.length > 0 ? { ...scoped, id: { in: selectedIds } } : scoped;
  }

  async exportItems(params: ExportPageParams) {
    return this.list({
      model: "deal",
      baseWhere: this.exportWhere(params.selectedIds),
      select: this.userScopedSelect,
      params,
      map: (deal: Prisma.DealGetPayload<{ select: PrismaDealRepo["userScopedSelect"] }>) => this.toDto(deal),
    });
  }

  async exportCount(params: ExportPageParams) {
    const { where } = await this.buildQueryArgs(params, this.exportWhere(params.selectedIds));

    return this.prisma.deal.count({ where });
  }

  private async resolvePlacement(pipelineId?: string, stageId?: string) {
    if (pipelineId && stageId) return { pipelineId, stageId };

    if (pipelineId) {
      const firstStageId = await getPipelineRepo().getFirstStageOfPipeline(pipelineId);

      return { pipelineId, stageId: firstStageId ?? undefined };
    }

    if (stageId) {
      const pipelineIdByStageId = await getPipelineRepo().findPipelineIdsByStageIds(new Set([stageId]));

      return { pipelineId: pipelineIdByStageId.get(stageId), stageId };
    }

    const defaultPlacement = await getPipelineRepo().getDefaultPipelineWithFirstStage();

    return { pipelineId: defaultPlacement?.pipelineId, stageId: defaultPlacement?.stageId };
  }

  @Transaction
  async createDealOrThrow(args: RepoArgs<CreateDealRepo, "createDealOrThrow">) {
    const { companyId } = this.user;
    const {
      organizationIds,
      userIds,
      contactIds,
      services,
      taskIds,
      customFieldValues,
      name,
      notes,
      pipelineId,
      stageId,
      expectedCloseDate,
      probability,
    } = args;

    const placement = await this.resolvePlacement(pipelineId, stageId);

    const data = {
      name,
      notes: notes,
      companyId,
      pipelineId: placement.pipelineId ?? null,
      stageId: placement.stageId ?? null,
      stageEnteredAt: placement.stageId ? new Date() : null,
      expectedCloseDate: expectedCloseDate ?? null,
      probability: probability ?? null,
    };

    const deal = await this.prisma.deal.create({
      data,
      select: {
        id: true,
      },
    });

    const promises: Promise<unknown>[] = [];

    if (organizationIds.length > 0) {
      promises.push(
        this.prisma.dealOrganization.createMany({
          data: organizationIds.map((organizationId) => ({
            dealId: deal.id,
            organizationId,
            companyId,
          })),
        }),
      );
    }

    if (userIds.length > 0) {
      promises.push(
        this.prisma.dealUser.createMany({
          data: userIds.map((userId) => ({
            dealId: deal.id,
            userId,
            companyId,
          })),
        }),
      );
    }

    if (contactIds.length > 0) {
      promises.push(
        this.prisma.dealContact.createMany({
          data: contactIds.map((contactId) => ({
            dealId: deal.id,
            contactId,
            companyId,
          })),
        }),
      );
    }

    if (services.length > 0) {
      promises.push(
        this.prisma.serviceDeal.createMany({
          data: services.map((service) => ({
            dealId: deal.id,
            serviceId: service.serviceId,
            quantity: service.quantity,
            companyId,
          })),
        }),
      );
    }

    if (taskIds.length > 0) {
      promises.push(
        this.prisma.taskDeal.createMany({
          data: taskIds.map((taskId) => ({
            dealId: deal.id,
            taskId,
            companyId,
          })),
        }),
      );
    }

    promises.push(getCustomColumnRepo().writeValuesForCreate(EntityType.deal, deal.id, customFieldValues));

    await Promise.all(promises);

    await this.recalculateTotals([deal.id]);
    await this.recalculateRotting([deal.id]);

    const createdDeal = await this.prisma.deal.findFirstOrThrow({
      where: { id: deal.id, ...this.accessWhere("deal") },
      select: this.userScopedSelect,
    });

    const res = this.toDto(createdDeal);

    return res;
  }

  @Transaction
  async updateDealOrThrow(args: RepoArgs<UpdateDealRepo, "updateDealOrThrow">) {
    const { companyId } = this.user;
    const { id, organizationIds, userIds, contactIds, services, taskIds, customFieldValues, ...dealData } = args;

    const data: Prisma.DealUncheckedUpdateManyInput = { companyId };

    if (dealData.name !== undefined) data.name = dealData.name;
    if (dealData.notes !== undefined) data.notes = dealData.notes;
    if (dealData.pipelineId !== undefined) data.pipelineId = dealData.pipelineId;
    if (dealData.expectedCloseDate !== undefined) data.expectedCloseDate = dealData.expectedCloseDate;
    if (dealData.probability !== undefined) data.probability = dealData.probability;

    if (dealData.stageId !== undefined) {
      const existing = await this.prisma.deal.findFirst({
        where: { id, ...this.accessWhere("deal") },
        select: { stageId: true },
      });

      if (existing && existing.stageId !== dealData.stageId) {
        data.stageId = dealData.stageId;
        data.stageEnteredAt = dealData.stageId ? new Date() : null;

        if (dealData.stageId) {
          const pipelineIdByStageId = await getPipelineRepo().findPipelineIdsByStageIds(new Set([dealData.stageId]));
          const stagePipelineId = pipelineIdByStageId.get(dealData.stageId);

          if (stagePipelineId) data.pipelineId = stagePipelineId;
        }
      }
    } else if (dealData.pipelineId) {
      const existing = await this.prisma.deal.findFirst({
        where: { id, ...this.accessWhere("deal") },
        select: { pipelineId: true },
      });

      if (existing && existing.pipelineId !== dealData.pipelineId) {
        data.stageId = await getPipelineRepo().getFirstStageOfPipeline(dealData.pipelineId);
        data.stageEnteredAt = data.stageId ? new Date() : null;
      }
    }

    await this.prisma.deal.updateMany({
      where: { id, ...this.accessWhere("deal") },
      data,
    });

    const deletePromises: Promise<unknown>[] = [];
    const createPromises: Promise<unknown>[] = [];

    if (organizationIds !== undefined) {
      deletePromises.push(
        this.prisma.dealOrganization.deleteMany({
          where: { dealId: id, companyId, organization: this.accessWhere("organization") },
        }),
      );

      if (organizationIds !== null && organizationIds.length > 0) {
        createPromises.push(
          this.prisma.dealOrganization.createMany({
            data: organizationIds.map((organizationId) => ({
              dealId: id,
              organizationId,
              companyId,
            })),
          }),
        );
      }
    }

    if (userIds !== undefined) {
      deletePromises.push(
        this.prisma.dealUser.deleteMany({
          where: { dealId: id, companyId, user: { is: this.accessWhere("user") } },
        }),
      );

      if (userIds !== null && userIds.length > 0) {
        createPromises.push(
          this.prisma.dealUser.createMany({
            data: userIds.map((userId) => ({
              dealId: id,
              userId,
              companyId,
            })),
          }),
        );
      }
    }

    if (contactIds !== undefined) {
      deletePromises.push(
        this.prisma.dealContact.deleteMany({
          where: { dealId: id, companyId, contact: this.accessWhere("contact") },
        }),
      );

      if (contactIds !== null && contactIds.length > 0) {
        createPromises.push(
          this.prisma.dealContact.createMany({
            data: contactIds.map((contactId) => ({
              dealId: id,
              contactId,
              companyId,
            })),
          }),
        );
      }
    }

    if (services !== undefined) {
      deletePromises.push(
        this.prisma.serviceDeal.deleteMany({
          where: { dealId: id, companyId, service: this.accessWhere("service") },
        }),
      );

      if (services !== null && services.length > 0) {
        createPromises.push(
          this.prisma.serviceDeal.createMany({
            data: services.map((service) => ({
              dealId: id,
              serviceId: service.serviceId,
              quantity: service.quantity,
              companyId,
            })),
          }),
        );
      }
    }

    if (taskIds !== undefined) {
      deletePromises.push(
        this.prisma.taskDeal.deleteMany({
          where: { dealId: id, companyId, task: this.accessWhere("task") },
        }),
      );

      if (taskIds !== null && taskIds.length > 0) {
        createPromises.push(
          this.prisma.taskDeal.createMany({
            data: taskIds.map((taskId) => ({
              dealId: id,
              taskId,
              companyId,
            })),
          }),
        );
      }
    }

    if (customFieldValues !== undefined) {
      if (customFieldValues === null)
        createPromises.push(getCustomColumnRepo().deleteValuesForEntity(EntityType.deal, id));
      else createPromises.push(getCustomColumnRepo().replaceValuesForEntity(EntityType.deal, id, customFieldValues));
    }

    await Promise.all(deletePromises);
    await Promise.all(createPromises);

    await this.recalculateTotals([id]);
    await this.recalculateRotting([id]);

    const updatedDeal = await this.prisma.deal.findFirstOrThrow({
      where: { id, ...this.accessWhere("deal") },
      select: this.userScopedSelect,
    });

    const res = this.toDto(updatedDeal);

    return res;
  }

  async getCustomColumns() {
    return getCustomColumnRepo().findByEntityType(EntityType.deal);
  }

  private async findDefaultPipelineStages() {
    const { companyId } = this.user;

    return this.prisma.pipelineStage.findMany({
      where: { companyId, pipeline: { isDefault: true, archivedAt: null } },
      select: { id: true, name: true, probability: true },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    });
  }

  private async findPipelineStages(pipelineId: string) {
    const { companyId } = this.user;

    return this.prisma.pipelineStage.findMany({
      where: { companyId, pipelineId },
      select: { id: true, name: true, probability: true },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    });
  }

  async getGroupOptions(filters?: Filter[]) {
    const pipelineId = selectedPipelineId(filters);
    const stages = pipelineId ? await this.findPipelineStages(pipelineId) : await this.findDefaultPipelineStages();

    return stages.map((stage) => ({ value: stage.id, label: stage.name, weight: stage.probability }));
  }

  async findPipelineIdsByDealIds(ids: Set<string>) {
    if (ids.size === 0) return new Map<string, string>();

    const deals = await this.prisma.deal.findMany({
      where: {
        id: { in: Array.from(ids) },
        ...this.accessWhere("deal"),
      },
      select: { id: true, pipelineId: true },
    });

    return new Map(deals.flatMap((deal) => (deal.pipelineId ? [[deal.id, deal.pipelineId] as const] : [])));
  }

  async findIds(ids: Set<string>) {
    if (ids.size === 0) return new Set<string>();

    const deals = await this.prisma.deal.findMany({
      where: {
        id: { in: Array.from(ids) },
        ...this.accessWhere("deal"),
      },
      select: { id: true },
    });

    return new Set(deals.map((deal) => deal.id));
  }

  @Transaction
  async deleteDealOrThrow(id: string) {
    const deal = await this.prisma.deal.findFirstOrThrow({
      where: { id, ...this.accessWhere("deal") },
      select: this.userScopedSelect,
    });

    const dealDto: DealDto = this.toDto(deal);

    await this.prisma.deal.deleteMany({ where: { id, ...this.accessWhere("deal") } });

    return dealDto;
  }

  private async findTerminalStageId(pipelineId: string | null, kind: StageKind) {
    if (!pipelineId) return null;

    return getPipelineRepo().findStageIdByKind(pipelineId, kind);
  }

  private async applyClosingWrite(
    id: string,
    expectedStatus: DealStatus | { not: DealStatus },
    data: Prisma.DealUncheckedUpdateManyInput,
  ) {
    const { count } = await this.prisma.deal.updateMany({
      where: { id, status: expectedStatus, ...this.accessWhere("deal") },
      data,
    });

    if (count === 0) return null;

    await this.recalculateTotals([id]);

    const updatedDeal = await this.prisma.deal.findFirstOrThrow({
      where: { id, ...this.accessWhere("deal") },
      select: this.userScopedSelect,
    });

    return this.toDto(updatedDeal);
  }

  @Transaction
  async markDealWonOrThrow(id: string) {
    const { companyId } = this.user;

    const existing = await this.prisma.deal.findFirstOrThrow({
      where: { id, ...this.accessWhere("deal") },
      select: { pipelineId: true, stageId: true },
    });

    const closedAt = new Date();
    const wonStageId = await this.findTerminalStageId(existing.pipelineId, StageKind.won);

    return this.applyClosingWrite(id, DealStatus.open, {
      companyId,
      ...wonTransition(closedAt),
      ...dealStageMove(wonStageId, existing.stageId, closedAt),
    });
  }

  @Transaction
  async markDealLostOrThrow(args: RepoArgs<MarkDealLostRepo, "markDealLostOrThrow">) {
    const { companyId } = this.user;
    const { id, lostReasonId, lostNotes } = args;

    const existing = await this.prisma.deal.findFirstOrThrow({
      where: { id, ...this.accessWhere("deal") },
      select: { pipelineId: true, stageId: true },
    });

    const closedAt = new Date();
    const lostStageId = await this.findTerminalStageId(existing.pipelineId, StageKind.lost);

    return this.applyClosingWrite(id, DealStatus.open, {
      companyId,
      ...lostTransition(closedAt, lostReasonId, lostNotes ?? null),
      ...dealStageMove(lostStageId, existing.stageId, closedAt),
    });
  }

  @Transaction
  async reopenDealOrThrow(args: RepoArgs<ReopenDealRepo, "reopenDealOrThrow">) {
    const { companyId } = this.user;
    const { id, stageId } = args;

    const existing = await this.prisma.deal.findFirstOrThrow({
      where: { id, ...this.accessWhere("deal") },
      select: { pipelineId: true, stageId: true, stageEnteredAt: true },
    });

    const reopenedAt = new Date();
    const targetStageId =
      stageId ?? (existing.pipelineId ? await getPipelineRepo().getFirstStageOfPipeline(existing.pipelineId) : null);
    const stageMove = dealStageMove(targetStageId, existing.stageId, reopenedAt);
    const movedPipelineIds = stageMove.stageId
      ? await getPipelineRepo().findPipelineIdsByStageIds(new Set([stageMove.stageId]))
      : null;
    const reopenedStageId = stageMove.stageId ?? existing.stageId;
    const reopenedStageEnteredAt = stageMove.stageEnteredAt ?? existing.stageEnteredAt;
    const rottingDaysByStageId = await this.findStageRottingDays(reopenedStageId ? [reopenedStageId] : [], companyId);

    return this.applyClosingWrite(
      id,
      { not: DealStatus.open },
      {
        companyId,
        ...reopenTransition(
          computeRottingAt(
            DealStatus.open,
            reopenedStageEnteredAt,
            reopenedStageId ? rottingDaysByStageId.get(reopenedStageId) : null,
          ),
        ),
        ...stageMove,
        ...(stageMove.stageId ? { pipelineId: movedPipelineIds?.get(stageMove.stageId) ?? existing.pipelineId } : {}),
      },
    );
  }

  async findOpenStageHistory(dealId: string) {
    return this.prisma.dealStageHistory.findFirst({
      where: { dealId, companyId: this.companyId, exitedAt: null },
      orderBy: { enteredAt: "desc" },
      select: { id: true, toStageId: true, enteredAt: true },
    });
  }

  async closeStageHistory(args: RepoArgs<DealStageHistoryRepo, "closeStageHistory">) {
    const { id, exitedAt, durationSeconds } = args;

    await this.prisma.dealStageHistory.updateMany({
      where: { id, companyId: this.companyId, exitedAt: null },
      data: { exitedAt, durationSeconds },
    });
  }

  async openStageHistory(args: RepoArgs<DealStageHistoryRepo, "openStageHistory">) {
    const { dealId, fromStageId, toStageId, enteredAt, userId } = args;

    await this.prisma.dealStageHistory.create({
      data: { companyId: this.companyId, dealId, fromStageId, toStageId, enteredAt, userId },
    });
  }

  async recalculateTotals(dealIds: string[]) {
    if (dealIds.length === 0) return;

    const { companyId } = this.user;
    const uniqueDealIds = Array.from(new Set(dealIds));

    const [existingDeals, serviceDeals] = await Promise.all([
      this.prisma.deal.findMany({
        where: { id: { in: uniqueDealIds }, companyId },
        select: {
          id: true,
          totalValue: true,
          totalQuantity: true,
          weightedValue: true,
          stageId: true,
          probability: true,
        },
      }),
      this.prisma.serviceDeal.findMany({
        where: { dealId: { in: uniqueDealIds }, companyId },
        include: { service: { select: { amount: true } } },
      }),
    ]);

    const computedTotalsByDealId = new Map<string, { totalValue: number; totalQuantity: number }>(
      uniqueDealIds.map((id) => [id, { totalValue: 0, totalQuantity: 0 }]),
    );

    for (const serviceDeal of serviceDeals) {
      const totals = computedTotalsByDealId.get(serviceDeal.dealId);
      if (!totals) continue;
      totals.totalValue += serviceDeal.service.amount * serviceDeal.quantity;
      totals.totalQuantity += serviceDeal.quantity;
    }

    const probabilityByStageId = await this.findStageProbabilities(
      existingDeals.flatMap((deal) => (deal.stageId ? [deal.stageId] : [])),
      companyId,
    );

    const existingDealsById = new Map(existingDeals.map((deal) => [deal.id, deal]));
    const updates: Promise<unknown>[] = [];

    for (const [dealId, totals] of computedTotalsByDealId.entries()) {
      const existing = existingDealsById.get(dealId);
      if (!existing) continue;

      const stageProbability = existing.stageId ? probabilityByStageId.get(existing.stageId) : undefined;
      const weightedValue = computeWeightedValue(
        totals.totalValue,
        effectiveProbability(existing.probability, stageProbability),
      );

      if (
        existing.totalValue === totals.totalValue &&
        existing.totalQuantity === totals.totalQuantity &&
        existing.weightedValue === weightedValue
      )
        continue;

      updates.push(this.prisma.deal.update({ where: { id: dealId, companyId }, data: { ...totals, weightedValue } }));
    }

    await Promise.all(updates);
  }

  async recalculateWeightedValuesForCompany() {
    const { companyId } = this.user;

    const deals = await this.prisma.deal.findMany({ where: { companyId }, select: { id: true } });

    await this.recalculateTotals(deals.map((deal) => deal.id));
  }

  private async resolveDealWeighting(companyId: string) {
    const columnId = await this.companyRepo.getDealWeightingColumnId();
    if (!columnId) return null;

    const column = await this.prisma.customColumn.findFirst({
      where: { id: columnId, companyId, entityType: EntityType.deal },
      select: { id: true, options: true },
    });

    if (!column) return null;

    return { columnId: column.id, weightByOptionValue: readOptionWeights(column.options) };
  }

  private async findStageValuesByDealId(columnId: string, dealIds: string[], companyId: string) {
    const rows = await this.prisma.customFieldValue.findMany({
      where: { columnId, companyId, dealId: { in: dealIds } },
      select: { dealId: true, value: true },
    });

    return new Map(rows.flatMap((row) => (row.dealId && row.value ? [[row.dealId, row.value] as const] : [])));
  }

  async recalculateRotting(dealIds: string[]) {
    if (dealIds.length === 0) return;

    const { companyId } = this.user;
    const uniqueDealIds = Array.from(new Set(dealIds));

    const deals = await this.prisma.deal.findMany({
      where: { id: { in: uniqueDealIds }, companyId },
      select: { id: true, status: true, stageId: true, stageEnteredAt: true, rottingAt: true },
    });

    const rottingDaysByStageId = await this.findStageRottingDays(
      deals.flatMap((deal) => (deal.stageId ? [deal.stageId] : [])),
      companyId,
    );

    const updates: Promise<unknown>[] = [];

    for (const deal of deals) {
      const rottingDays = deal.stageId ? rottingDaysByStageId.get(deal.stageId) : null;
      const rottingAt = computeRottingAt(deal.status, deal.stageEnteredAt, rottingDays);

      if ((deal.rottingAt?.getTime() ?? null) === (rottingAt?.getTime() ?? null)) continue;

      updates.push(this.prisma.deal.update({ where: { id: deal.id, companyId }, data: { rottingAt } }));
    }

    await Promise.all(updates);
  }

  private async findStageRottingDays(stageIds: string[], companyId: string) {
    const uniqueStageIds = Array.from(new Set(stageIds));

    if (uniqueStageIds.length === 0) return new Map<string, number | null>();

    const stages = await this.prisma.pipelineStage.findMany({
      where: { id: { in: uniqueStageIds }, companyId },
      select: { id: true, rottingDays: true },
    });

    return new Map(stages.map((stage) => [stage.id, stage.rottingDays]));
  }

  private async findStageProbabilities(stageIds: string[], companyId: string) {
    const uniqueStageIds = Array.from(new Set(stageIds));

    if (uniqueStageIds.length === 0) return new Map<string, number>();

    const stages = await this.prisma.pipelineStage.findMany({
      where: { id: { in: uniqueStageIds }, companyId },
      select: { id: true, probability: true },
    });

    return new Map(stages.map((stage) => [stage.id, stage.probability]));
  }
}
