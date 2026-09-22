import type { DomainEventHandlers } from "@/features/event/domain-event.listener";
import type { EmailService } from "@/features/email/email.service";
import type { LeadNotificationRepo } from "./lead-notification.repo";

import { createElement } from "react";

import { DomainEvent } from "@/features/event/domain-events";
import { DomainEventListener } from "@/features/event/domain-event.listener";
import { env } from "@/env";
import LeadCreatedNotice from "@/components/emails/lead-created-notice";
import { getEmailLayoutCopy } from "@/components/emails/base/email-layout-copy";
import { getTranslator } from "@/i18n/get-translator";
import { resolveUserLocale } from "@/i18n/user-locale";

export class LeadCreatedNotificationListener extends DomainEventListener {
  readonly handlers: DomainEventHandlers;

  constructor(
    private repo: LeadNotificationRepo,
    private emailService: EmailService,
  ) {
    super();

    this.handlers = {
      [DomainEvent.LEAD_CREATED]: async ({ entityId, payload }) => {
        const recipient = await this.repo.findLeadOwnerCompanyWide(entityId);
        if (!recipient) return;

        const locale = resolveUserLocale(recipient);
        const t = await getTranslator(locale, "LeadCreatedNotice");
        const layoutCopy = await getEmailLayoutCopy(locale);

        const sourceName = payload.source?.name ?? payload.sourceOrigin;
        const personName = payload.contact ? `${payload.contact.firstName} ${payload.contact.lastName}`.trim() : "";
        const subject = t("subject", { leadTitle: payload.title });

        await this.emailService.send({
          to: recipient.email,
          subject,
          react: createElement(LeadCreatedNotice, {
            locale,
            layoutCopy,
            leadLink: `${env.BASE_URL}/leads/${entityId}`,
            subject,
            preview: t("preview", { sourceName }),
            intro: t("intro", { leadTitle: payload.title, sourceName }),
            person: personName ? t("person", { personName }) : null,
            organization: payload.organization
              ? t("organization", { organizationName: payload.organization.name })
              : null,
            cta: t("cta"),
            fallback: t("fallback"),
          }),
        });
      },
    };
  }
}
