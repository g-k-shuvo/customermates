import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { Validated } from "@/core/validation/validation.utils";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { nextAutomationRunAt } from "../automation-next-run";

export type DueAutomation = {
  id: string;
  companyId: string;
  schedule: string;
  scheduleTimeZone: string | null;
};

export abstract class SweepDueAutomationsRepo {
  abstract findDueAutomationsUnscoped(now: Date, limit: number): Promise<DueAutomation[]>;
  abstract claimScheduledAutomationUnscoped(args: {
    automationId: string;
    companyId: string;
    nextRunAt: Date | null;
  }): Promise<string | null>;
}

export const AUTOMATION_SWEEP_LIMIT = 100;

@SystemInteractor
export class SweepDueAutomationsInteractor {
  constructor(
    private repo: SweepDueAutomationsRepo,
    private backgroundTaskService: BackgroundTaskService,
  ) {}

  async invoke(): Validated<{ sweptAutomations: number }> {
    const now = new Date();
    const due = await this.repo.findDueAutomationsUnscoped(now, AUTOMATION_SWEEP_LIMIT);

    const dispatched = await Promise.all(
      due.map(async (automation) => {
        const nextRunAt = nextAutomationRunAt(automation.schedule, automation.scheduleTimeZone, now);

        const runId = await this.repo.claimScheduledAutomationUnscoped({
          automationId: automation.id,
          companyId: automation.companyId,
          nextRunAt,
        });
        if (!runId) return 0;

        await this.backgroundTaskService.dispatch("run-automation", {
          automationRunId: runId,
          companyId: automation.companyId,
        });

        return 1;
      }),
    );

    return { ok: true as const, data: { sweptAutomations: dispatched.reduce<number>((sum, one) => sum + one, 0) } };
  }
}
