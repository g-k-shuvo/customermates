import type { AutomationEmailSender } from "./automation-email-sender";
import type { EmailService } from "@/features/email/email.service";

import React from "react";

import AutomationNotice from "@/components/emails/automation-notice";
import { getEmailLayoutCopy } from "@/components/emails/base/email-layout-copy";
import { DEFAULT_LOCALE } from "@/i18n/locale-registry";

export class CrmAutomationEmailSender implements AutomationEmailSender {
  constructor(private emailService: EmailService) {}

  async send(args: { to: string; subject: string; body: string }): Promise<boolean> {
    const layoutCopy = await getEmailLayoutCopy(DEFAULT_LOCALE);

    return await this.emailService.send({
      to: args.to,
      subject: args.subject,
      react: React.createElement(AutomationNotice, {
        locale: DEFAULT_LOCALE,
        layoutCopy,
        subject: args.subject,
        body: args.body,
      }),
    });
  }
}
