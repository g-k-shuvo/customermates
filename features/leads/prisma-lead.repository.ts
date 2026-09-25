import type { Prisma } from "@/generated/prisma";
import type { RepoArgs } from "@/core/utils/types";
import type { ExportPageParams, ExportRecordsRepo } from "@/core/base/base-export-records-page.interactor";
import type { GetConfigurationRepo } from "@/core/base/base-get-configuration.interactor";
import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { GetLeadByIdRepo } from "./get/get-lead-by-id.interactor";
import type { GetLeadsRepo } from "./get/get-leads.interactor";
import type { GetWidgetFilterableFieldsLeadRepo } from "../widget/get-widget-filterable-fields.interactor";
import type { CreateLeadRepo } from "./upsert/create-lead.repo";
import type { UpdateLeadRepo } from "./upsert/update-lead.repo";
import type { ConvertLeadToDealRepo } from "./convert/convert-lead-to-deal.repo";
import type { DeleteLeadRepo } from "./delete/delete-lead.repo";
import type { FindLeadsByIdsRepo } from "./find-leads-by-ids.repo";
import type { LeadNotificationRecipient, LeadNotificationRepo } from "./listener/lead-notification.repo";

import { EntityType, LeadStatus, Resource } from "@/generated/prisma";

import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { Filter } from "@/core/base/base-get.schema";

import { type LeadDto } from "./lead.schema";

import { BaseRepository } from "@/core/base/base-repository";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";
import { getCustomColumnRepo } from "@/core/di";
import {
  customSelectGroupables,
  dateGroupables,
  enumGroupables,
  relationGroupables,
} from "@/core/base/grouping/groupable-field";

const LEAD_STATUS_VALUES = new Set<string>(Object.values(LeadStatus));

const SELECTION_OPERATORS: string[] = [FilterOperatorKey.in, FilterOperatorKey.notIn];

const LEAD_STATUS_FILTER_FIELD: string = FilterFieldKey.leadStatus;

function partitionLeadFilters(filters: Filter[] | undefined) {
  const leadStatus: Filter[] = [];
  const rest: Filter[] = [];

  for (const filter of filters ?? []) {
    if (filter.field === LEAD_STATUS_FILTER_FIELD) leadStatus.push(filter);
    else rest.push(filter);
  }

  return { leadStatus, rest };
}

function selectedFilterValues(filter: Filter): string[] {
  const raw: unknown = "value" in filter ? filter.value : undefined;

  return (Array.isArray(raw) ? (raw as unknown[]) : [raw]).flatMap((value) =>
    typeof value === "string" ? [value] : [],
  );
}

function leadStatusClause(filter: Filter): Prisma.LeadWhereInput | null {
  if (!SELECTION_OPERATORS.includes(filter.operator)) return null;

  const values = selectedFilterValues(filter).filter((value): value is LeadStatus => LEAD_STATUS_VALUES.has(value));

  if (values.length === 0) return null;

  return filter.operator === FilterOperatorKey.in ? { status: { in: values } } : { status: { notIn: values } };
}

function existingAndClauses(where: Prisma.LeadWhereInput): Prisma.LeadWhereInput[] {
  if (!where.AND) return [];

  return Array.isArray(where.AND) ? where.AND : [where.AND];
}

export class PrismaLeadRepo
  extends BaseRepository<Prisma.LeadWhereInput>
  implements
    GetLeadByIdRepo,
    GetLeadsRepo,
    GetConfigurationRepo,
    GetWidgetFilterableFieldsLeadRepo,
    CreateLeadRepo,
    UpdateLeadRepo,
    DeleteLeadRepo,
    ConvertLeadToDealRepo,
    FindLeadsByIdsRepo,
    LeadNotificationRepo,
    ExportRecordsRepo<LeadDto>
{
  private get leadSelect() {
    return {
      id: true,
      title: true,
      status: true,
      sourceOrigin: true,
      labels: true,
      value: true,
      notes: true,
      convertedDealId: true,
      convertedAt: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
      contact: { select: { id: true, firstName: true, lastName: true } },
      organization: { select: { id: true, name: true } },
      owner: { select: { id: true, firstName: true, lastName: true, email: true } },
      source: { select: { id: true, name: true, slug: true } },
      customFieldValues: { select: { columnId: true, value: true } },
    } as const;
  }

  override async buildQueryArgs(params: GetQueryParams, baseWhere: Prisma.LeadWhereInput = {}) {
    const { leadStatus, rest } = partitionLeadFilters(params.filters);
    const args = await super.buildQueryArgs({ ...params, filters: rest }, baseWhere);

    const clauses = leadStatus.flatMap((filter) => {
      const clause = leadStatusClause(filter);

      return clause ? [clause] : [];
    });

    const where =
      clauses.length === 0 ? args.where : { ...args.where, AND: [...existingAndClauses(args.where), ...clauses] };

    return { ...args, where };
  }

  getSearchableFields() {
    return [{ field: "title" }];
  }

  getSortableFields() {
    return [
      { field: "title", resolvedFields: ["title"] },
      { field: "status", resolvedFields: ["status"] },
      { field: "value", resolvedFields: ["value"] },
      { field: "createdAt", resolvedFields: ["createdAt"] },
      { field: "updatedAt", resolvedFields: ["updatedAt"] },
    ];
  }

  async getFilterableFields() {
    if (!this.canAccess(Resource.leads)) return [];

    const customFields = await getCustomColumnRepo().getFilterableCustomFields(EntityType.lead);

    return [
      { field: FilterFieldKey.leadStatus, operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.leadStatus] },
      ...customFields,
      { field: FilterFieldKey.updatedAt, operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.updatedAt] },
      { field: FilterFieldKey.createdAt, operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.createdAt] },
    ];
  }

  async getCustomColumns() {
    return getCustomColumnRepo().findByEntityType(EntityType.lead);
  }

  async getGroupableFields(customColumns?: readonly CustomColumnDto[]) {
    if (!this.canAccess(Resource.leads)) return [];

    return [
      ...customSelectGroupables(EntityType.lead, customColumns ?? (await this.getCustomColumns())),
      ...enumGroupables("lead", { leadStatus: true }),
      ...relationGroupables("lead", {
        contactIds: this.canAccess(Resource.contacts),
        organizationIds: this.canAccess(Resource.organizations),
        userIds: this.canAccess(Resource.users),
      }),
      ...dateGroupables("lead", { createdAt: true, updatedAt: true }),
    ];
  }

  async getItems(params: GetQueryParams) {
    return this.list({
      model: "lead",
      baseWhere: this.accessWhere("lead"),
      select: this.leadSelect,
      params,
      map: (lead: Prisma.LeadGetPayload<{ select: PrismaLeadRepo["leadSelect"] }>) => lead,
    });
  }

  async getCount(params: GetQueryParams) {
    const { where } = await this.buildQueryArgs(params, this.accessWhere("lead"));

    return this.prisma.lead.count({ where });
  }

  private exportWhere(selectedIds?: string[]): Prisma.LeadWhereInput {
    const scoped = this.accessWhere("lead");

    return selectedIds && selectedIds.length > 0 ? { ...scoped, id: { in: selectedIds } } : scoped;
  }

  async exportItems(params: ExportPageParams) {
    return this.list({
      model: "lead",
      baseWhere: this.exportWhere(params.selectedIds),
      select: this.leadSelect,
      params,
      map: (lead: Prisma.LeadGetPayload<{ select: PrismaLeadRepo["leadSelect"] }>) => lead,
    });
  }

  async exportCount(params: ExportPageParams) {
    const { where } = await this.buildQueryArgs(params, this.exportWhere(params.selectedIds));

    return this.prisma.lead.count({ where });
  }

  async getLeadById(id: string): Promise<LeadDto | null> {
    return this.prisma.lead.findFirst({
      where: { ...this.accessWhere("lead"), id },
      select: this.leadSelect,
    });
  }

  async findIds(ids: Set<string>) {
    if (ids.size === 0) return new Set<string>();

    const leads = await this.prisma.lead.findMany({
      where: { id: { in: Array.from(ids) }, ...this.accessWhere("lead") },
      select: { id: true },
    });

    return new Set(leads.map((lead) => lead.id));
  }

  async findLeadOwnerCompanyWide(leadId: string): Promise<LeadNotificationRecipient | null> {
    const lead = await this.prisma.lead.findFirst({
      where: { companyId: this.companyId, id: leadId },
      select: { owner: { select: { email: true, displayLanguage: true } } },
    });

    return lead?.owner ?? null;
  }

  async getOrThrowCompanyWide(id: string): Promise<LeadDto> {
    return this.prisma.lead.findFirstOrThrow({
      where: { companyId: this.companyId, id },
      select: this.leadSelect,
    });
  }

  @Transaction()
  async createLeadOrThrow(args: RepoArgs<CreateLeadRepo, "createLeadOrThrow">): Promise<LeadDto> {
    const created = await this.prisma.lead.create({
      data: {
        companyId: this.companyId,
        title: args.title,
        status: args.status,
        sourceOrigin: args.sourceOrigin,
        sourceId: args.sourceId ?? null,
        contactId: args.contactId ?? null,
        organizationId: args.organizationId ?? null,
        ownerUserId: args.ownerUserId ?? null,
        labels: args.labels,
        value: args.value ?? null,
        notes: args.notes ?? undefined,
      },
      select: { id: true },
    });

    await getCustomColumnRepo().writeValuesForCreate(EntityType.lead, created.id, args.customFieldValues);

    return this.getOrThrowCompanyWide(created.id);
  }

  @Transaction()
  async updateLeadOrThrow(args: RepoArgs<UpdateLeadRepo, "updateLeadOrThrow">): Promise<LeadDto> {
    const { id, ...rest } = args;

    await this.prisma.lead.updateMany({
      where: { ...this.accessWhere("lead"), id },
      data: {
        ...(rest.title === undefined ? {} : { title: rest.title }),
        ...(rest.status === undefined ? {} : { status: rest.status }),
        ...(rest.sourceOrigin === undefined ? {} : { sourceOrigin: rest.sourceOrigin }),
        ...(rest.sourceId === undefined ? {} : { sourceId: rest.sourceId }),
        ...(rest.contactId === undefined ? {} : { contactId: rest.contactId }),
        ...(rest.organizationId === undefined ? {} : { organizationId: rest.organizationId }),
        ...(rest.ownerUserId === undefined ? {} : { ownerUserId: rest.ownerUserId }),
        ...(rest.labels === undefined ? {} : { labels: rest.labels }),
        ...(rest.value === undefined ? {} : { value: rest.value }),
        ...(rest.notes === undefined ? {} : { notes: rest.notes }),
      },
    });

    if (rest.customFieldValues !== undefined)
      await getCustomColumnRepo().replaceValuesForEntity(EntityType.lead, id, rest.customFieldValues);

    return this.getOrThrowCompanyWide(id);
  }

  @Transaction()
  async markLeadConvertedOrThrow(args: RepoArgs<ConvertLeadToDealRepo, "markLeadConvertedOrThrow">): Promise<LeadDto> {
    await this.prisma.lead.updateMany({
      where: { ...this.accessWhere("lead"), id: args.id },
      data: { convertedDealId: args.dealId, convertedAt: args.convertedAt, status: LeadStatus.converted },
    });

    return this.getOrThrowCompanyWide(args.id);
  }

  @Transaction()
  async deleteLeadOrThrow(id: string): Promise<string> {
    await this.prisma.lead.deleteMany({ where: { ...this.accessWhere("lead"), id } });

    return id;
  }
}
