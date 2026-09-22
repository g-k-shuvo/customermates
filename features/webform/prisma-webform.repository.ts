import type { Prisma } from "@/generated/prisma";
import type {
  ConsumeRateLimitArgs,
  IngestWebFormSubmissionRepo,
  StoreSubmissionArgs,
  WebFormSourceRecord,
} from "./ingest/ingest-web-form-submission.repo";

import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";

const UNIQUE_VIOLATION = "P2002";

const CONSUME_RATE_LIMIT_SQL = `
  INSERT INTO "WebFormRateLimit" ("id", "companyId", "sourceId", "windowStart", "count", "updatedAt")
  VALUES (gen_random_uuid(), $1, $2, $3, 1, now())
  ON CONFLICT ("sourceId") DO UPDATE SET
    "count" = CASE WHEN "WebFormRateLimit"."windowStart" < $3 THEN 1 ELSE "WebFormRateLimit"."count" + 1 END,
    "windowStart" = GREATEST("WebFormRateLimit"."windowStart", $3),
    "updatedAt" = now()
  RETURNING "count"`;

export class PrismaWebFormRepo extends BaseRepository implements IngestWebFormSubmissionRepo {
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
