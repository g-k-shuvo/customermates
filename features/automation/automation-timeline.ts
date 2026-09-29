import { EntityType } from "@/generated/prisma";
import { DomainEvent } from "@/features/event/domain-events";

export type AutomationTimelineEvent =
  | DomainEvent.CONTACT_AUTOMATED
  | DomainEvent.ORGANIZATION_AUTOMATED
  | DomainEvent.DEAL_AUTOMATED
  | DomainEvent.SERVICE_AUTOMATED
  | DomainEvent.TASK_AUTOMATED;

const TIMELINE_EVENT_BY_ENTITY_TYPE: Partial<Record<EntityType, AutomationTimelineEvent>> = {
  [EntityType.contact]: DomainEvent.CONTACT_AUTOMATED,
  [EntityType.organization]: DomainEvent.ORGANIZATION_AUTOMATED,
  [EntityType.deal]: DomainEvent.DEAL_AUTOMATED,
  [EntityType.service]: DomainEvent.SERVICE_AUTOMATED,
  [EntityType.task]: DomainEvent.TASK_AUTOMATED,
};

export function automationTimelineEventFor(
  entityType: EntityType | null,
  triggerEvent: string | null,
): AutomationTimelineEvent | null {
  if (!entityType || triggerEvent?.endsWith(".deleted")) return null;

  return TIMELINE_EVENT_BY_ENTITY_TYPE[entityType] ?? null;
}
