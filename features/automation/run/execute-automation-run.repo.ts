import type { AutomationActionKind, AutomationRunStatus, EntityType } from "@/generated/prisma";
import type { Filter } from "@/core/base/base-get.schema";

export type AutomationRunPlanStep = {
  id: string;
  stepId: string;
  position: number;
  kind: AutomationActionKind;
  config: unknown;
};

export type AutomationRunPlan = {
  runId: string;
  automationId: string;
  automationName: string;
  companyId: string;
  entityType: EntityType | null;
  entityId: string | null;
  triggerEvent: string | null;
  conditions: Filter[] | null;
  steps: AutomationRunPlanStep[];
};

export abstract class ExecuteAutomationRunRepo {
  abstract findRunPlanUnscoped(runId: string): Promise<AutomationRunPlan | null>;
  abstract claimRunUnscoped(runId: string): Promise<boolean>;
  abstract markRunStepUnscoped(args: {
    runStepId: string;
    status: AutomationRunStatus;
    output?: unknown;
    error?: string | null;
    startedAt?: Date;
    finishedAt?: Date;
  }): Promise<void>;
  abstract settleRunUnscoped(args: { runId: string; status: AutomationRunStatus; error: string | null }): Promise<void>;
  abstract findAutomationOwnerUserIdUnscoped(companyId: string): Promise<string | null>;
}
