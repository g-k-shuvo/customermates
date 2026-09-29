import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { Validated } from "@/core/validation/validation.utils";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { nextAutomationRunAt } from "../automation-next-run";

export type DueAutomation = {
  id: string;
  companyId: string;
  schedule: string;
  scheduleTimeZone: string | null;
  nextRunAt: Date | null;
};

export abstract class SweepDueAutomationsRepo {
  abstract findDueAutomationsUnscoped(now: Date, limit: number): Promise<DueAutomation[]>;
  abstract claimScheduledAutomationUnscoped(args: {
    automationId: string;
    companyId: string;
    nextRunAt: Date | null;
  }): Promise<string | null>;
  abstract restampScheduleUnscoped(args: {
    automationId: string;
    companyId: string;
    from: Date;
    nextRunAt: Date | null;
  }): Promise<boolean>;
}

export const AUTOMATION_SWEEP_LIMIT = 100;
export const SCHEDULE_CATCH_UP_MS = 60 * 60 * 1000;

export type SweepResult = { sweptAutomations: number; restamped: number; disabled: boolean };

@SystemInteractor
export class SweepDueAutomationsInteractor {
  constructor(
    private repo: SweepDueAutomationsRepo,
    private backgroundTaskService: BackgroundTaskService,
    private enabled: boolean,
  ) {}

  async invoke(now: Date = new Date()): Validated<SweepResult> {
    if (!this.enabled) return { ok: true as const, data: { sweptAutomations: 0, restamped: 0, disabled: true } };

    const due = await this.repo.findDueAutomationsUnscoped(now, AUTOMATION_SWEEP_LIMIT);
    let restamped = 0;

    const dispatched = await Promise.all(
      due.map(async (automation) => {
        const nextRunAt = nextAutomationRunAt(automation.schedule, automation.scheduleTimeZone, now);

        if (automation.nextRunAt && now.getTime() - automation.nextRunAt.getTime() > SCHEDULE_CATCH_UP_MS) {
          const moved = await this.repo.restampScheduleUnscoped({
            automationId: automation.id,
            companyId: automation.companyId,
            from: automation.nextRunAt,
            nextRunAt,
          });
          if (moved) restamped += 1;
          return 0;
        }

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

    return {
      ok: true as const,
      data: { sweptAutomations: dispatched.reduce<number>((sum, one) => sum + one, 0), restamped, disabled: false },
    };
  }
}
