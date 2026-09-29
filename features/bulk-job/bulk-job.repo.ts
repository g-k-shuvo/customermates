import type { BulkJobDto } from "./bulk-job.schema";
import type { BulkJobKind, Prisma } from "@/generated/prisma";

export type RunningBulkJob = {
  id: string;
  kind: BulkJobKind;
  subjectId: string;
  definition: Prisma.JsonValue;
  expectedTotal: number | null;
  createdById: string | null;
  startedAt: Date;
};

export abstract class BulkJobRepo {
  abstract findRunningJobOrNull(jobId: string): Promise<RunningBulkJob | null>;
  abstract findRunningJobForSubjectOrNull(kind: BulkJobKind, subjectId: string): Promise<RunningBulkJob | null>;
  abstract createJob(args: {
    kind: BulkJobKind;
    subjectId: string;
    definition: Prisma.InputJsonValue;
    expectedTotal: number;
  }): Promise<BulkJobDto>;
  abstract advanceJob(jobId: string, args: { cursor: string | null; processed: number }): Promise<void>;
  abstract completeJob(jobId: string, args: { finalTotal: number; stale: boolean }): Promise<void>;
  abstract failJob(jobId: string, error: string): Promise<void>;
  abstract cancelStaleJob(jobId: string): Promise<void>;
  abstract findJobOrNull(jobId: string): Promise<BulkJobDto | null>;
}
