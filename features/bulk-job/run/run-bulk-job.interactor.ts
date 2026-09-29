import type { BulkJobHandlers } from "../bulk-job-handler";
import type { BulkJobRepo } from "../bulk-job.repo";
import type { Validated } from "@/core/validation/validation.utils";

import { z } from "zod";

import { BULK_JOB_PAGE_SIZE } from "../bulk-job.constants";
import { type BulkJobIdData, BulkJobIdSchema, type BulkJobPageData, BulkJobPageSchema } from "../bulk-job.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { BULK_WRITE_TRANSACTION } from "@/core/decorators/transaction.decorator";

const PageResultSchema = z.object({ nextCursor: z.string().nullable() });
type PageResult = z.infer<typeof PageResultSchema>;

const FinishResultSchema = z.object({ finalTotal: z.number().int(), stale: z.boolean() });
type FinishResult = z.infer<typeof FinishResultSchema>;

const FailResultSchema = z.object({ failed: z.boolean() });
type FailResult = z.infer<typeof FailResultSchema>;

@TenantInteractor()
export class RunBulkJobPageInteractor extends AuthenticatedInteractor<BulkJobPageData, PageResult> {
  constructor(
    private repo: BulkJobRepo,
    private handlers: BulkJobHandlers,
  ) {
    super();
  }

  @Write({ input: BulkJobPageSchema, output: PageResultSchema, tx: BULK_WRITE_TRANSACTION })
  async invoke(data: BulkJobPageData): Validated<PageResult> {
    const job = await this.repo.findRunningJobOrNull(data.jobId);
    const handler = job ? this.handlers[job.kind] : undefined;
    if (!job || !handler) return { ok: true as const, data: { nextCursor: null } };

    const page = await handler.processPage(job, data.cursor, BULK_JOB_PAGE_SIZE);
    await this.repo.advanceJob(job.id, { cursor: page.nextCursor, processed: page.processed });

    return { ok: true as const, data: { nextCursor: page.nextCursor } };
  }
}

@TenantInteractor()
export class FinishBulkJobInteractor extends AuthenticatedInteractor<BulkJobIdData, FinishResult> {
  constructor(
    private repo: BulkJobRepo,
    private handlers: BulkJobHandlers,
  ) {
    super();
  }

  @Write({ input: BulkJobIdSchema, output: FinishResultSchema, tx: BULK_WRITE_TRANSACTION })
  async invoke(data: BulkJobIdData): Validated<FinishResult> {
    const job = await this.repo.findRunningJobOrNull(data.id);
    const handler = job ? this.handlers[job.kind] : undefined;
    if (!job || !handler) return { ok: true as const, data: { finalTotal: 0, stale: false } };

    const finalTotal = await handler.countTotal(job);
    const outcome = { finalTotal, stale: job.expectedTotal !== null && job.expectedTotal !== finalTotal };
    await handler.finish(job, outcome);
    await this.repo.completeJob(job.id, outcome);

    return { ok: true as const, data: outcome };
  }
}

@TenantInteractor()
export class FailBulkJobInteractor extends AuthenticatedInteractor<BulkJobIdData, FailResult> {
  constructor(
    private repo: BulkJobRepo,
    private handlers: BulkJobHandlers,
  ) {
    super();
  }

  @Write({ input: BulkJobIdSchema, output: FailResultSchema })
  async invoke(data: BulkJobIdData): Validated<FailResult> {
    const job = await this.repo.findRunningJobOrNull(data.id);
    if (!job) return { ok: true as const, data: { failed: false } };

    await this.handlers[job.kind]?.fail(job);
    await this.repo.failJob(job.id, "stepFailed");

    return { ok: true as const, data: { failed: true } };
  }
}
