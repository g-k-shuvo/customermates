import type { BulkJobHandlers } from "./bulk-job-handler";
import type { BulkJobRepo } from "./bulk-job.repo";
import type { BulkJobDto } from "./bulk-job.schema";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { BulkJobKind, Prisma } from "@/generated/prisma";

import { STALE_BULK_JOB_AFTER_MS } from "./bulk-job.constants";

export type StartBulkJobResult = { ok: true; job: BulkJobDto } | { ok: false; reason: "running" | "unsupported" };

export class BulkJobStarter {
  constructor(
    private repo: BulkJobRepo,
    private handlers: BulkJobHandlers,
    private backgroundTasks: BackgroundTaskService,
  ) {}

  async start(args: {
    kind: BulkJobKind;
    subjectId: string;
    definition: Prisma.InputJsonValue;
  }): Promise<StartBulkJobResult> {
    const handler = this.handlers[args.kind];
    if (!handler) return { ok: false, reason: "unsupported" };

    const running = await this.repo.findRunningJobForSubjectOrNull(args.kind, args.subjectId);
    if (running) {
      if (Date.now() - running.startedAt.getTime() < STALE_BULK_JOB_AFTER_MS) return { ok: false, reason: "running" };
      await this.repo.cancelStaleJob(running.id);
    }

    const expectedTotal = await handler.countTotal({
      id: "",
      kind: args.kind,
      subjectId: args.subjectId,
      definition: args.definition as Prisma.JsonValue,
      expectedTotal: null,
      createdById: null,
      startedAt: new Date(),
    });
    const job = await this.repo.createJob({ ...args, expectedTotal });
    await this.backgroundTasks.dispatch("run-bulk-job", { jobId: job.id });

    return { ok: true, job };
  }
}
