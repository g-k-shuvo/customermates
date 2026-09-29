import type { Validated } from "@/core/validation/validation.utils";
import type { AutomationRunStatus, Prisma } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

export type UnsettledAutomationRun = {
  id: string;
  companyId: string;
  status: AutomationRunStatus;
  claimToken: string | null;
  createdAt: Date;
  steps: Array<{ startedAt: Date | null; snapshot: Prisma.JsonValue }>;
};

export abstract class ReconcileAutomationRunsRepo {
  abstract findUnsettledRunsUnscoped(before: Date, limit: number): Promise<UnsettledAutomationRun[]>;
  abstract interruptRunUnscoped(runId: string, error: string): Promise<boolean>;
}

export type WorkflowRunStatusProbe = { isWorkflowTerminal(externalRunId: string): Promise<boolean> };

export const RECONCILE_IDLE_MS = 15 * 60 * 1000;
export const NEVER_STARTED_MS = 60 * 60 * 1000;
export const RECONCILE_LIMIT = 100;
export const RUN_INTERRUPTED = "interrupted";
export const RUN_NEVER_STARTED = "neverStarted";

function waitingUntil(run: UnsettledAutomationRun): number | null {
  const ends = run.steps.flatMap((step) => {
    const config = (step.snapshot as { config?: { seconds?: unknown } } | null)?.config;
    const seconds = typeof config?.seconds === "number" ? config.seconds : null;

    return step.startedAt && seconds !== null ? [step.startedAt.getTime() + seconds * 1000] : [];
  });

  return ends.length > 0 ? Math.max(...ends) : null;
}

@SystemInteractor
export class ReconcileAutomationRunsInteractor {
  constructor(
    private repo: ReconcileAutomationRunsRepo,
    private workflows: WorkflowRunStatusProbe,
  ) {}

  async invoke(now: Date = new Date()): Validated<{ settled: number }> {
    const runs = await this.repo.findUnsettledRunsUnscoped(
      new Date(now.getTime() - RECONCILE_IDLE_MS),
      RECONCILE_LIMIT,
    );

    let settled = 0;
    for (const run of runs) {
      const reason = await this.reasonToSettle(run, now);
      if (reason && (await this.repo.interruptRunUnscoped(run.id, reason))) settled += 1;
    }

    return { ok: true as const, data: { settled } };
  }

  private async reasonToSettle(run: UnsettledAutomationRun, now: Date): Promise<string | null> {
    if (!run.claimToken) return now.getTime() - run.createdAt.getTime() > NEVER_STARTED_MS ? RUN_NEVER_STARTED : null;

    const waitEnd = waitingUntil(run);
    if (waitEnd !== null && waitEnd + RECONCILE_IDLE_MS > now.getTime()) return null;

    const terminal = await this.workflows.isWorkflowTerminal(run.claimToken).catch(() => false);

    return terminal ? RUN_INTERRUPTED : null;
  }
}
