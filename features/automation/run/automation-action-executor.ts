import type { AutomationStepError } from "../automation-step-errors";
import type { AutomationRunPlan } from "./execute-automation-run.repo";
import type { EntityType } from "@/generated/prisma";

export type AutomationActionContext = {
  run: AutomationRunPlan;
  runStepId: string;
  entityType: EntityType | null;
  entityId: string | null;
};

export type AutomationActionOutcome = { ok: true; output: unknown } | { ok: false; error: AutomationStepError };

export abstract class AutomationActionExecutor {
  abstract execute(args: {
    kind: string;
    config: unknown;
    context: AutomationActionContext;
  }): Promise<AutomationActionOutcome>;
}
