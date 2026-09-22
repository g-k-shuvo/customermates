import type { RepoArgs } from "@/core/utils/types";
import type { Prisma } from "@/generated/prisma";
import type {
  ConsumeRateLimitArgs,
  IngestWebFormSubmissionRepo,
  StoreSubmissionArgs,
  WebFormSourceRecord,
} from "./ingest/ingest-web-form-submission.repo";

import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { CreateWebFormSourceRepo } from "./upsert/create-web-form-source.repo";
import type { DeleteWebFormSourceRepo } from "./delete/delete-web-form-source.repo";
import type { GetWebFormSourceByIdRepo } from "./get/get-web-form-source-by-id.interactor";
import type { FindWebFormSourcesByIdsRepo } from "./find-web-form-sources-by-ids.repo";
import type { GetWebFormSourcesRepo } from "./get/get-web-form-sources.interactor";
import type { RotateWebFormSecretRepo } from "./upsert/rotate-web-form-secret.repo";
import type { UpdateWebFormSourceRepo } from "./upsert/update-web-form-source.repo";

import { randomBytes } from "node:crypto";

import { type WebFormSourceDto, type WebFormSourceWithSecret } from "./webform-source.schema";
import { WebFormFieldMappingSchema } from "./ingest/field-mapping";

import { BaseRepository } from "@/core/base/base-repository";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";

const UNIQUE_VIOLATION = "P2002";

const CONSUME_RATE_LIMIT_SQL = `
  INSERT INTO "WebFormRateLimit" ("id", "companyId", "sourceId", "windowStart", "count", "updatedAt")
  VALUES (gen_random_uuid(), $1, $2, $3, 1, now())
  ON CONFLICT ("sourceId") DO UPDATE SET
    "count" = CASE WHEN "WebFormRateLimit"."windowStart" < $3 THEN 1 ELSE "WebFormRateLimit"."count" + 1 END,
    "windowStart" = GREATEST("WebFormRateLimit"."windowStart", $3),
    "updatedAt" = now()
  RETURNING "count"`;

function newSigningSecret(): string {
  return randomBytes(32).toString("hex");
}

export class PrismaWebFormRepo
  extends BaseRepository
  implements
    IngestWebFormSubmissionRepo,
    CreateWebFormSourceRepo,
    UpdateWebFormSourceRepo,
    DeleteWebFormSourceRepo,
    GetWebFormSourcesRepo,
    GetWebFormSourceByIdRepo,
    FindWebFormSourcesByIdsRepo,
    RotateWebFormSecretRepo
{
  private get sourceSelect() {
    return {
      id: true,
      name: true,
      slug: true,
      active: true,
      defaultOwnerId: true,
      defaultLabels: true,
      fieldMapping: true,
      createdAt: true,
      updatedAt: true,
    };
  }

  private toSourceDto(row: {
    id: string;
    name: string;
    slug: string;
    active: boolean;
    defaultOwnerId: string | null;
    defaultLabels: string[];
    fieldMapping: unknown;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const mapping = WebFormFieldMappingSchema.safeParse(row.fieldMapping);

    return { ...row, fieldMapping: mapping.success ? mapping.data : {}, endpointPath: `/api/webforms/${row.slug}` };
  }

  async slugExists(slug: string): Promise<boolean> {
    const existing = await this.prisma.webFormSource.findFirst({
      where: { companyId: this.companyId, slug },
      select: { id: true },
    });

    return existing !== null;
  }

  getSearchableFields() {
    return [{ field: "name" }, { field: "slug" }];
  }

  getSortableFields() {
    return [
      { field: "name", resolvedFields: ["name"] },
      { field: "slug", resolvedFields: ["slug"] },
      { field: "createdAt", resolvedFields: ["createdAt"] },
      { field: "updatedAt", resolvedFields: ["updatedAt"] },
    ];
  }

  getFilterableFields() {
    return Promise.resolve([
      { field: FilterFieldKey.updatedAt, operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.updatedAt] },
      { field: FilterFieldKey.createdAt, operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.createdAt] },
    ]);
  }

  async getItems(params: GetQueryParams): Promise<WebFormSourceDto[]> {
    const args = await this.buildQueryArgs(params, { companyId: this.companyId });

    const rows = await this.prisma.webFormSource.findMany({ ...args, select: this.sourceSelect });

    return rows.map((row) => this.toSourceDto(row));
  }

  async getCount(params: GetQueryParams): Promise<number> {
    const { where } = await this.buildQueryArgs(params, { companyId: this.companyId });

    return this.prisma.webFormSource.count({ where });
  }

  async getWebFormSourceById(id: string): Promise<WebFormSourceDto | null> {
    const row = await this.prisma.webFormSource.findFirst({
      where: { companyId: this.companyId, id },
      select: this.sourceSelect,
    });

    return row ? this.toSourceDto(row) : null;
  }

  async findIds(ids: Set<string>): Promise<Set<string>> {
    if (ids.size === 0) return new Set<string>();

    const rows = await this.prisma.webFormSource.findMany({
      where: { companyId: this.companyId, id: { in: Array.from(ids) } },
      select: { id: true },
    });

    return new Set(rows.map((row) => row.id));
  }

  @Transaction()
  async updateWebFormSourceOrThrow(
    args: RepoArgs<UpdateWebFormSourceRepo, "updateWebFormSourceOrThrow">,
  ): Promise<WebFormSourceDto> {
    const { id, ...rest } = args;

    await this.prisma.webFormSource.updateMany({
      where: { companyId: this.companyId, id },
      data: {
        ...(rest.name === undefined ? {} : { name: rest.name }),
        ...(rest.active === undefined ? {} : { active: rest.active }),
        ...(rest.defaultOwnerId === undefined ? {} : { defaultOwnerId: rest.defaultOwnerId }),
        ...(rest.defaultLabels === undefined ? {} : { defaultLabels: rest.defaultLabels }),
        ...(rest.fieldMapping === undefined ? {} : { fieldMapping: rest.fieldMapping }),
      },
    });

    return this.getWebFormSourceOrThrowCompanyWide(id);
  }

  async getWebFormSourceOrThrowCompanyWide(id: string): Promise<WebFormSourceDto> {
    const row = await this.prisma.webFormSource.findFirstOrThrow({
      where: { companyId: this.companyId, id },
      select: this.sourceSelect,
    });

    return this.toSourceDto(row);
  }

  @Transaction()
  async deleteWebFormSourceOrThrow(id: string): Promise<string> {
    await this.prisma.webFormSource.deleteMany({ where: { companyId: this.companyId, id } });

    return id;
  }

  @Transaction()
  async createWebFormSourceOrThrow(
    args: RepoArgs<CreateWebFormSourceRepo, "createWebFormSourceOrThrow">,
  ): Promise<WebFormSourceWithSecret> {
    const signingSecret = newSigningSecret();

    const row = await this.prisma.webFormSource.create({
      data: {
        companyId: this.companyId,
        name: args.name,
        slug: args.slug,
        active: args.active,
        defaultOwnerId: args.defaultOwnerId ?? null,
        defaultLabels: args.defaultLabels,
        fieldMapping: args.fieldMapping,
        signingSecret,
      },
      select: this.sourceSelect,
    });

    return { ...this.toSourceDto(row), signingSecret };
  }

  @Transaction()
  async rotateWebFormSecretOrThrow(id: string): Promise<WebFormSourceWithSecret> {
    const signingSecret = newSigningSecret();

    await this.prisma.webFormSource.updateMany({
      where: { companyId: this.companyId, id },
      data: { signingSecret },
    });

    const row = await this.prisma.webFormSource.findFirstOrThrow({
      where: { companyId: this.companyId, id },
      select: this.sourceSelect,
    });

    return { ...this.toSourceDto(row), signingSecret };
  }

  @BypassTenantGuard
  async findActiveSourceBySlugUnscoped(slug: string): Promise<WebFormSourceRecord | null> {
    return this.prisma.webFormSource.findFirst({
      where: { slug, active: true },
      select: { id: true, companyId: true, signingSecret: true },
    });
  }

  @BypassTenantGuard
  async consumeRateLimitUnscoped(args: ConsumeRateLimitArgs): Promise<boolean> {
    const windowStart = new Date(Math.floor(Date.now() / args.windowMs) * args.windowMs);

    const rows = await this.prisma.$queryRawUnsafe<{ count: number }[]>(
      CONSUME_RATE_LIMIT_SQL,
      args.companyId,
      args.sourceId,
      windowStart,
    );

    return Number(rows[0]?.count ?? 0) <= args.max;
  }

  @BypassTenantGuard
  async storeSubmissionUnscoped(args: StoreSubmissionArgs): Promise<{ id: string; created: boolean }> {
    try {
      const submission = await this.prisma.webFormSubmission.create({
        data: {
          companyId: args.companyId,
          sourceId: args.sourceId,
          externalId: args.externalId,
          rawPayload: args.rawPayload as Prisma.InputJsonValue,
        },
        select: { id: true },
      });

      return { id: submission.id, created: true };
    } catch (error) {
      if (args.externalId === null || (error as { code?: string }).code !== UNIQUE_VIOLATION) throw error;

      const existing = await this.prisma.webFormSubmission.findUnique({
        where: { sourceId_externalId: { sourceId: args.sourceId, externalId: args.externalId } },
        select: { id: true },
      });

      if (!existing) throw error;

      return { id: existing.id, created: false };
    }
  }
}
