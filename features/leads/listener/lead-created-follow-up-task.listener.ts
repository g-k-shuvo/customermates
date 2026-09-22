import type { DomainEventHandlers } from "@/features/event/domain-event.listener";
import type { LeadFollowUpTaskRepo } from "./lead-follow-up-task.repo";
import type { LeadNotificationRepo } from "./lead-notification.repo";

import { addBusinessDays, setHours, setMilliseconds, setMinutes, setSeconds } from "date-fns";

import { DomainEvent } from "@/features/event/domain-events";
import { DomainEventListener } from "@/features/event/domain-event.listener";
import { getTranslator } from "@/i18n/get-translator";
import { resolveUserLocale } from "@/i18n/user-locale";
import { DEFAULT_LOCALE } from "@/i18n/locale-registry";

export const LEAD_FOLLOW_UP_BUSINESS_DAYS = 1;

export const LEAD_FOLLOW_UP_HOUR = 9;

export function leadFollowUpDueAt(createdAt: Date): Date {
  const due = addBusinessDays(createdAt, LEAD_FOLLOW_UP_BUSINESS_DAYS);

  return setMilliseconds(setSeconds(setMinutes(setHours(due, LEAD_FOLLOW_UP_HOUR), 0), 0), 0);
}

export class LeadCreatedFollowUpTaskListener extends DomainEventListener {
  readonly handlers: DomainEventHandlers;

  constructor(
    private taskRepo: LeadFollowUpTaskRepo,
    private leadRepo: LeadNotificationRepo,
  ) {
    super();

    this.handlers = {
      [DomainEvent.LEAD_CREATED]: async ({ entityId, payload }) => {
        const owner = await this.leadRepo.findLeadOwnerCompanyWide(entityId);
        const locale = owner ? resolveUserLocale(owner) : DEFAULT_LOCALE;
        const t = await getTranslator(locale, "LeadFollowUpTask");

        await this.taskRepo.createLeadFollowUpTaskOrThrow({
          name: t("name", { leadTitle: payload.title }),
          dueAt: leadFollowUpDueAt(payload.createdAt),
          ownerUserId: payload.owner?.id ?? null,
          contactId: payload.contact?.id ?? null,
          organizationId: payload.organization?.id ?? null,
        });
      },
    };
  }
}
