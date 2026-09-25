import type { AutomationRunPlan } from "./execute-automation-run.repo";
import type { EntityType } from "@/generated/prisma";

export type AutomationActionContext = {
  run: AutomationRunPlan;
  entityType: EntityType | null;
  entityId: string | null;
};

export type AutomationActionOutcome = { ok: true; output: unknown } | { ok: false; error: string };

export abstract class AutomationActionExecutor {
  abstract execute(args: {
    kind: string;
    config: unknown;
    context: AutomationActionContext;
  }): Promise<AutomationActionOutcome>;
}
