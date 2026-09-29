import type { ExecuteAutomationRunRepo } from "./execute-automation-run.repo";
import type { AutomationConditionMatcher } from "../automation-condition-matcher";
import type { Filter } from "@/core/base/base-get.schema";
import type { EntityType } from "@/generated/prisma";
import type { Validated } from "@/core/validation/validation.utils";
import type { EventService } from "@/features/event/event.service";

import z from "zod";
import { AutomationActionKind, AutomationRunStatus, AutomationTriggerKind } from "@/generated/prisma";

import { DelayConfigSchema } from "../automation-action.schema";
import { automationTriggerForEvent } from "../automation-trigger-map";
import { automationTimelineEventFor } from "../automation-timeline";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";

export const PrepareAutomationRunSchema = z.object({
  automationRunId: z.uuid(),
  companyId: z.uuid(),
  claimToken: z.string().min(1).max(200).nullable().default(null),
});
export type PrepareAutomationRunData = z.input<typeof PrepareAutomationRunSchema>;

export type AutomationConditionCheck = {
  companyId: string;
  entityType: EntityType;
  entityId: string;
  conditions: Filter[];
};

export const CONDITIONS_NO_LONGER_MET = "conditionsNoLongerMet";

export type PreparedAutomationRun = {
  ownerUserId: string | null;
  steps: Array<{ runStepId: string; kind: AutomationActionKind; delaySeconds: number | null }>;
  conditionCheck: AutomationConditionCheck | null;
};

@SystemInteractor
export class PrepareAutomationRunInteractor {
  constructor(
    private repo: ExecuteAutomationRunRepo,
    private conditions: AutomationConditionMatcher,
    private events?: EventService,
  ) {}

  @Validate(PrepareAutomationRunSchema)
  async invoke(data: PrepareAutomationRunData): Validated<PreparedAutomationRun> {
    const plan = await this.repo.findRunPlanUnscoped(data.automationRunId);
    if (!plan) return { ok: true as const, data: { ownerUserId: null, steps: [], conditionCheck: null } };

    const claimed = await this.repo.claimRunUnscoped(data.automationRunId, data.claimToken ?? null);
    if (!claimed) return { ok: true as const, data: { ownerUserId: null, steps: [], conditionCheck: null } };

    const ownerUserId = await this.repo.findAutomationOwnerUserIdUnscoped(plan.companyId);
    const conditionCheck =
      plan.entityType && plan.entityId && plan.conditions && plan.conditions.length > 0
        ? {
            companyId: plan.companyId,
            entityType: plan.entityType,
            entityId: plan.entityId,
            conditions: plan.conditions,
          }
        : null;

    return {
      ok: true as const,
      data: {
        ownerUserId,
        steps: plan.steps.map((step) => ({
          runStepId: step.id,
          kind: step.kind,
          delaySeconds: step.kind === AutomationActionKind.delay ? delaySecondsOf(step.config) : null,
        })),
        conditionCheck,
      },
    };
  }

  async matchesConditions(check: AutomationConditionCheck): Promise<boolean> {
    return this.conditions.matchesInTenant(check);
  }

  async recheckFor(args: { automationRunId: string }): Promise<AutomationConditionCheck | null> {
    const plan = await this.repo.findRunPlanUnscoped(args.automationRunId);
    if (!plan?.entityType || !plan.entityId) return null;

    const trigger = plan.triggerEvent ? automationTriggerForEvent(plan.triggerEvent) : undefined;
    if (trigger?.triggerKind === AutomationTriggerKind.recordDeleted) return null;

    return {
      companyId: plan.companyId,
      entityType: plan.entityType,
      entityId: plan.entityId,
      conditions: plan.conditions ?? [],
    };
  }

  async stillApplies(check: AutomationConditionCheck): Promise<boolean> {
    if (!(await this.conditions.existsInTenant(check))) return false;

    return this.conditions.matchesInTenant(check);
  }

  async cancel(args: { automationRunId: string }): Promise<void> {
    await this.repo.cancelRunUnscoped(args.automationRunId, CONDITIONS_NO_LONGER_MET);
  }

  async skip(args: { automationRunId: string }): Promise<void> {
    await this.repo.settleRunUnscoped({
      runId: args.automationRunId,
      status: AutomationRunStatus.skipped,
      error: null,
    });
  }

  async completeWait(args: { runStepId: string }): Promise<void> {
    await this.repo.markRunStepUnscoped({
      runStepId: args.runStepId,
      status: AutomationRunStatus.succeeded,
      finishedAt: new Date(),
    });
  }

  async beginWait(args: { runStepId: string }): Promise<void> {
    await this.repo.markRunStepUnscoped({
      runStepId: args.runStepId,
      status: AutomationRunStatus.running,
      startedAt: new Date(),
    });
  }

  async settle(args: {
    automationRunId: string;
    companyId: string;
    failed: boolean;
    ownerUserId?: string | null;
  }): Promise<void> {
    await this.repo.settleRunUnscoped({
      runId: args.automationRunId,
      status: args.failed ? AutomationRunStatus.failed : AutomationRunStatus.succeeded,
      error: null,
    });

    if (this.events && args.ownerUserId)
      await this.recordOnTimeline(args.automationRunId, args.companyId, args.ownerUserId);
  }

  private async recordOnTimeline(automationRunId: string, companyId: string, ownerUserId: string): Promise<void> {
    const plan = await this.repo.findRunPlanUnscoped(automationRunId);
    const event = plan ? automationTimelineEventFor(plan.entityType, plan.triggerEvent) : null;
    if (!plan?.entityId || !event) return;

    await this.events?.publish(
      event,
      { entityId: plan.entityId, payload: { name: plan.automationName } },
      { systemCompanyId: companyId, systemUserId: ownerUserId },
    );
  }
}

function delaySecondsOf(config: unknown): number | null {
  const parsed = DelayConfigSchema.safeParse(config);

  return parsed.success ? parsed.data.seconds : null;
}
