import { AutomationTriggerKind, EntityType } from "@/generated/prisma";
import { DomainEvent } from "@/features/event/domain-events";

export type AutomationEventTrigger = { entityType: EntityType; triggerKind: AutomationTriggerKind };

export const AUTOMATION_TRIGGER_BY_EVENT: Partial<Record<DomainEvent, AutomationEventTrigger>> = {
  [DomainEvent.CONTACT_CREATED]: { entityType: EntityType.contact, triggerKind: AutomationTriggerKind.recordCreated },
  [DomainEvent.CONTACT_UPDATED]: { entityType: EntityType.contact, triggerKind: AutomationTriggerKind.recordUpdated },
  [DomainEvent.CONTACT_DELETED]: { entityType: EntityType.contact, triggerKind: AutomationTriggerKind.recordDeleted },
  [DomainEvent.ORGANIZATION_CREATED]: {
    entityType: EntityType.organization,
    triggerKind: AutomationTriggerKind.recordCreated,
  },
  [DomainEvent.ORGANIZATION_UPDATED]: {
    entityType: EntityType.organization,
    triggerKind: AutomationTriggerKind.recordUpdated,
  },
  [DomainEvent.ORGANIZATION_DELETED]: {
    entityType: EntityType.organization,
    triggerKind: AutomationTriggerKind.recordDeleted,
  },
  [DomainEvent.DEAL_CREATED]: { entityType: EntityType.deal, triggerKind: AutomationTriggerKind.recordCreated },
  [DomainEvent.DEAL_UPDATED]: { entityType: EntityType.deal, triggerKind: AutomationTriggerKind.recordUpdated },
  [DomainEvent.DEAL_DELETED]: { entityType: EntityType.deal, triggerKind: AutomationTriggerKind.recordDeleted },
  [DomainEvent.LEAD_CREATED]: { entityType: EntityType.lead, triggerKind: AutomationTriggerKind.recordCreated },
  [DomainEvent.LEAD_UPDATED]: { entityType: EntityType.lead, triggerKind: AutomationTriggerKind.recordUpdated },
  [DomainEvent.LEAD_DELETED]: { entityType: EntityType.lead, triggerKind: AutomationTriggerKind.recordDeleted },
  [DomainEvent.TASK_CREATED]: { entityType: EntityType.task, triggerKind: AutomationTriggerKind.recordCreated },
  [DomainEvent.TASK_UPDATED]: { entityType: EntityType.task, triggerKind: AutomationTriggerKind.recordUpdated },
  [DomainEvent.TASK_DELETED]: { entityType: EntityType.task, triggerKind: AutomationTriggerKind.recordDeleted },
};

export function automationTriggerForEvent(event: string): AutomationEventTrigger | undefined {
  return AUTOMATION_TRIGGER_BY_EVENT[event as DomainEvent];
}

export function changedFieldsMatch(declared: readonly string[], changed: readonly string[]): boolean {
  if (declared.length === 0) return true;

  return declared.some((field) => changed.includes(field));
}
