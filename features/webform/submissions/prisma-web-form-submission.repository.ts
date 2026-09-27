import type { GetWebFormSubmissionsRepo } from "./get-web-form-submissions.interactor";
import type { RetryWebFormSubmissionRepo } from "./retry-web-form-submission.interactor";
import type { FindWebFormSubmissionsByIdsRepo } from "./find-web-form-submissions-by-ids.repo";
import type { WebFormSubmissionDto, WebFormSubmissionStatus } from "./web-form-submission.schema";

import type { Prisma } from "@/generated/prisma";

import { WEB_FORM_SUBMISSION_STATUSES } from "./web-form-submission.schema";
import { mapWebFormFields, WebFormFieldMappingSchema } from "../ingest/field-mapping";

import { BaseRepository } from "@/core/base/base-repository";
import { type Filter, type GetQueryParams } from "@/core/base/base-get.schema";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";

const SUBMISSION_SELECT = {
  id: true,
  sourceId: true,
  externalId: true,
  status: true,
  error: true,
  leadId: true,
  rawPayload: true,
  receivedAt: true,
  processedAt: true,
  source: { select: { name: true, fieldMapping: true } },
  lead: { select: { title: true } },
} as const;

type SubmissionRow = Prisma.WebFormSubmissionGetPayload<{ select: typeof SUBMISSION_SELECT }>;

const STATUS_FILTER_FIELD: string = FilterFieldKey.submissionStatus;

function statusClause(filter: Filter): Prisma.WebFormSubmissionWhereInput | null {
  if (filter.operator !== FilterOperatorKey.in && filter.operator !== FilterOperatorKey.notIn) return null;

  const raw: unknown = "value" in filter ? filter.value : undefined;
  const values = (Array.isArray(raw) ? (raw as unknown[]) : [raw]).filter(
    (value): value is string =>
      typeof value === "string" && (WEB_FORM_SUBMISSION_STATUSES as readonly string[]).includes(value),
  );
  if (values.length === 0) return null;

  return filter.operator === FilterOperatorKey.in ? { status: { in: values } } : { status: { notIn: values } };
}

function knownStatus(status: string): WebFormSubmissionStatus {
  return (WEB_FORM_SUBMISSION_STATUSES as readonly string[]).includes(status)
    ? (status as WebFormSubmissionStatus)
    : "received";
}

function submitterOf(row: SubmissionRow): { email: string | null; name: string | null } {
  const mapping = WebFormFieldMappingSchema.safeParse(row.source.fieldMapping);
  if (!mapping.success) return { email: null, name: null };

  const fields = mapWebFormFields(row.rawPayload, mapping.data);
  const name = [fields.firstName, fields.lastName].filter(Boolean).join(" ");

  return { email: fields.email, name: name || null };
}

function toDto(row: SubmissionRow): WebFormSubmissionDto {
  return {
    id: row.id,
    sourceId: row.sourceId,
    sourceName: row.source.name,
    externalId: row.externalId,
    status: knownStatus(row.status),
    error: row.error,
    ...submitterOf(row),
    leadId: row.leadId,
    leadTitle: row.lead?.title ?? null,
    rawPayload: row.rawPayload,
    receivedAt: row.receivedAt,
    processedAt: row.processedAt,
  };
}

export class PrismaWebFormSubmissionRepo
  extends BaseRepository<Prisma.WebFormSubmissionWhereInput>
  implements GetWebFormSubmissionsRepo, RetryWebFormSubmissionRepo, FindWebFormSubmissionsByIdsRepo
{
  override async buildQueryArgs(params: GetQueryParams, baseWhere: Prisma.WebFormSubmissionWhereInput = {}) {
    const statusFilters = (params.filters ?? []).filter((filter) => filter.field === STATUS_FILTER_FIELD);
    const rest = (params.filters ?? []).filter((filter) => filter.field !== STATUS_FILTER_FIELD);
    const args = await super.buildQueryArgs({ ...params, filters: rest }, baseWhere);
    const clauses = statusFilters.flatMap((filter) => {
      const clause = statusClause(filter);
      return clause ? [clause] : [];
    });
    if (clauses.length === 0) return args;

    const existing = args.where.AND ? (Array.isArray(args.where.AND) ? args.where.AND : [args.where.AND]) : [];

    return { ...args, where: { ...args.where, AND: [...existing, ...clauses] } };
  }

  getSearchableFields() {
    return [{ field: "externalId" }, { field: "error" }];
  }

  getSortableFields() {
    return [
      { field: "receivedAt", resolvedFields: ["receivedAt"] },
      { field: "processedAt", resolvedFields: ["processedAt"] },
      { field: "status", resolvedFields: ["status"] },
    ];
  }

  getFilterableFields() {
    return Promise.resolve([
      {
        field: FilterFieldKey.submissionStatus,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.submissionStatus],
      },
    ]);
  }

  async getItems(params: GetQueryParams): Promise<WebFormSubmissionDto[]> {
    const args = await this.buildQueryArgs(params, { companyId: this.companyId });
    const rows = await this.prisma.webFormSubmission.findMany({ ...args, select: SUBMISSION_SELECT });

    return rows.map(toDto);
  }

  async getCount(params: GetQueryParams): Promise<number> {
    const { where } = await this.buildQueryArgs(params, { companyId: this.companyId });

    return this.prisma.webFormSubmission.count({ where });
  }

  async getSubmissionByIdOrThrow(id: string): Promise<WebFormSubmissionDto> {
    const row = await this.prisma.webFormSubmission.findFirstOrThrow({
      where: { id, companyId: this.companyId },
      select: SUBMISSION_SELECT,
    });

    return toDto(row);
  }

  async requeueFailedSubmission(id: string): Promise<boolean> {
    const { count } = await this.prisma.webFormSubmission.updateMany({
      where: { id, companyId: this.companyId, status: "failed", leadId: null },
      data: { status: "received", error: null },
    });

    return count === 1;
  }

  async findIds(ids: Set<string>): Promise<Set<string>> {
    if (ids.size === 0) return new Set<string>();

    const rows = await this.prisma.webFormSubmission.findMany({
      where: { id: { in: [...ids] }, companyId: this.companyId },
      select: { id: true },
    });

    return new Set(rows.map((row) => row.id));
  }
}
