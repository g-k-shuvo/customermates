import type { BulkJobRepo, RunningBulkJob } from "./bulk-job.repo";
import type { BulkJobDto } from "./bulk-job.schema";
import type { BulkJobKind, Prisma } from "@/generated/prisma";

import { BulkJobStatus } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";

const RUNNING_SELECT = {
  id: true,
  kind: true,
  subjectId: true,
  definition: true,
  expectedTotal: true,
  createdById: true,
  startedAt: true,
} as const;

const DTO_SELECT = {
  id: true,
  kind: true,
  status: true,
  subjectId: true,
  processed: true,
  expectedTotal: true,
  finalTotal: true,
  stale: true,
  error: true,
  startedAt: true,
  finishedAt: true,
} as const;

export class PrismaBulkJobRepo extends BaseRepository implements BulkJobRepo {
  async findRunningJobOrNull(jobId: string): Promise<RunningBulkJob | null> {
    return await this.prisma.bulkJob.findFirst({
      where: { id: jobId, companyId: this.companyId, status: BulkJobStatus.running },
      select: RUNNING_SELECT,
    });
  }

  async findRunningJobForSubjectOrNull(kind: BulkJobKind, subjectId: string): Promise<RunningBulkJob | null> {
    return await this.prisma.bulkJob.findFirst({
      where: { companyId: this.companyId, kind, subjectId, status: BulkJobStatus.running },
      orderBy: { startedAt: "desc" },
      select: RUNNING_SELECT,
    });
  }

  async createJob(args: {
    kind: BulkJobKind;
    subjectId: string;
    definition: Prisma.InputJsonValue;
    expectedTotal: number;
  }): Promise<BulkJobDto> {
    return await this.prisma.bulkJob.create({
      data: { companyId: this.companyId, createdById: this.userId, ...args },
      select: DTO_SELECT,
    });
  }

  async advanceJob(jobId: string, args: { cursor: string | null; processed: number }): Promise<void> {
    await this.prisma.bulkJob.updateMany({
      where: { id: jobId, companyId: this.companyId, status: BulkJobStatus.running },
      data: { cursor: args.cursor, processed: { increment: args.processed } },
    });
  }

  async completeJob(jobId: string, args: { finalTotal: number; stale: boolean }): Promise<void> {
    await this.prisma.bulkJob.updateMany({
      where: { id: jobId, companyId: this.companyId, status: BulkJobStatus.running },
      data: { status: BulkJobStatus.completed, finishedAt: new Date(), ...args },
    });
  }

  async failJob(jobId: string, error: string): Promise<void> {
    await this.prisma.bulkJob.updateMany({
      where: { id: jobId, companyId: this.companyId, status: BulkJobStatus.running },
      data: { status: BulkJobStatus.failed, finishedAt: new Date(), error },
    });
  }

  async cancelStaleJob(jobId: string): Promise<void> {
    await this.prisma.bulkJob.updateMany({
      where: { id: jobId, companyId: this.companyId, status: BulkJobStatus.running },
      data: { status: BulkJobStatus.cancelled, finishedAt: new Date() },
    });
  }

  async findJobOrNull(jobId: string): Promise<BulkJobDto | null> {
    return await this.prisma.bulkJob.findFirst({
      where: { id: jobId, companyId: this.companyId },
      select: DTO_SELECT,
    });
  }
}
