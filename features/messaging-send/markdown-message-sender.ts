import type { GuardedEmailSender } from "./guarded-email-sender";
import type { DedupeSource, SendMessageOutcome } from "./messaging-send.contract";
import type { AppLocale } from "@/i18n/locale-registry";
import type { MessageKind } from "@/generated/prisma";

import React from "react";

import CampaignMessage from "@/components/emails/campaign-message";
import { getEmailLayoutCopy } from "@/components/emails/base/email-layout-copy";
import { getTranslator } from "@/i18n/get-translator";

export type MarkdownMessage = {
  kind: MessageKind;
  source: DedupeSource;
  sourceId: string;
  automationRunStepId?: string | null;
  campaignId?: string | null;
  to: string;
  contactId: string | null;
  subject: string;
  html: string;
  locale: AppLocale;
  senderUserId?: string | null;
  bannerUrl?: string | null;
};

export class MarkdownMessageSender {
  constructor(private guardedSender: GuardedEmailSender) {}

  async send(message: MarkdownMessage): Promise<SendMessageOutcome> {
    const layoutCopy = await getEmailLayoutCopy(message.locale);
    const t = await getTranslator(message.locale, "CampaignMessage");

    return await this.guardedSender.send({
      kind: message.kind,
      source: message.source,
      sourceId: message.sourceId,
      automationRunStepId: message.automationRunStepId ?? null,
      campaignId: message.campaignId ?? null,
      to: message.to,
      contactId: message.contactId,
      subject: message.subject,
      senderUserId: message.senderUserId ?? null,
      render: ({ unsubscribeUrl }) =>
        React.createElement(CampaignMessage, {
          locale: message.locale,
          layoutCopy,
          subject: message.subject,
          html: message.html,
          bannerUrl: message.bannerUrl ?? null,
          unsubscribe: unsubscribeUrl ? { label: t("unsubscribe"), href: unsubscribeUrl } : null,
        }),
    });
  }
}
