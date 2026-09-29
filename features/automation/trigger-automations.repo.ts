import type { Filter } from "@/core/base/base-get.schema";
import type { AutomationTriggerKind, EntityType } from "@/generated/prisma";
import type { AutomationCausation } from "@/core/decorators/automation-context";

export type TriggerableAutomation = {
  id: string;
  changedFields: string[];
  conditions: Filter[] | null;
};

export type AdmittedAutomationRun = { id: string; automationId: string };

export abstract class TriggerAutomationsRepo {
  abstract findEventAutomationsUnscoped(
    companyId: string,
    entityType: EntityType,
    triggerKind: AutomationTriggerKind,
  ): Promise<TriggerableAutomation[]>;

  abstract admitAutomationRunsUnscoped(args: {
    companyId: string;
    automationIds: readonly string[];
    entityType: EntityType;
    entityId: string | null;
    triggerEvent: string;
    triggerPayload: unknown;
    causation?: AutomationCausation | null;
  }): Promise<AdmittedAutomationRun[]>;
}
