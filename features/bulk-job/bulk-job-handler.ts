import type { RunningBulkJob } from "./bulk-job.repo";
import type { BulkJobKind } from "@/generated/prisma";

export type BulkJobPage = { processed: number; nextCursor: string | null };

export abstract class BulkJobHandler {
  abstract readonly kind: BulkJobKind;
  abstract countTotal(job: RunningBulkJob): Promise<number>;
  abstract processPage(job: RunningBulkJob, cursor: string | null, take: number): Promise<BulkJobPage>;
  abstract finish(job: RunningBulkJob, outcome: { finalTotal: number; stale: boolean }): Promise<void>;
  abstract fail(job: RunningBulkJob): Promise<void>;
}

export type BulkJobHandlers = Partial<Record<BulkJobKind, BulkJobHandler>>;
