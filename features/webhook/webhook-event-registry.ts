export const RECORD_WEBHOOK_EVENTS = [
  "contact.created",
  "contact.updated",
  "contact.deleted",
  "organization.created",
  "organization.updated",
  "organization.deleted",
  "deal.created",
  "deal.updated",
  "deal.deleted",
  "service.created",
  "service.updated",
  "service.deleted",
  "task.created",
  "task.updated",
  "task.deleted",
] as const;

export const MESSAGING_WEBHOOK_EVENTS = [
  "messaging.message.received",
  "messaging.message.updated",
  "messaging.message.deleted",
  "messaging.message.reaction",
  "messaging.email.received",
  "messaging.email.deleted",
  "messaging.chat.updated",
  "messaging.chat.deleted",
  "messaging.calendar.changed",
  "messaging.calendar_event.changed",
  "messaging.relation.created",
] as const;

export const LEAD_WEBHOOK_EVENTS = ["lead.created", "lead.updated", "lead.deleted"] as const;

export const WEBHOOK_EVENTS = [...RECORD_WEBHOOK_EVENTS, ...MESSAGING_WEBHOOK_EVENTS] as const;

export const SUBSCRIBABLE_WEBHOOK_EVENTS = [
  ...RECORD_WEBHOOK_EVENTS,
  ...LEAD_WEBHOOK_EVENTS,
  ...MESSAGING_WEBHOOK_EVENTS,
] as const;

export const WEBHOOK_EVENT_COUNT = SUBSCRIBABLE_WEBHOOK_EVENTS.length;
export const WEBHOOK_MESSAGING_EVENT_COUNT = MESSAGING_WEBHOOK_EVENTS.length;
export const WEBHOOK_RECORD_EVENT_COUNT = WEBHOOK_EVENT_COUNT - WEBHOOK_MESSAGING_EVENT_COUNT;
