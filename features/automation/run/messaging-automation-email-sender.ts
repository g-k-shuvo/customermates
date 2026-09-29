import type { AutomationEmail, AutomationEmailResult, AutomationEmailSender } from "./automation-email-sender";
import type { MarkdownMessageSender } from "@/features/messaging-send/markdown-message-sender";
import type { MergeSource, MergeValuesRepo } from "@/features/messaging-send/render/merge-values.repo";
import type { MessageRecipientRepo, RecipientUser } from "@/features/messaging-send/recipients/message-recipient.repo";

import { MessageKind } from "@/generated/prisma";

import { mergeValuesFrom } from "@/features/messaging-send/render/merge-fields";
import { renderEmailMarkdown } from "@/features/messaging-send/render/render-email-markdown";
import { SENDER_UNVERIFIED } from "@/features/messaging-send/sender/sender-resolver";
import { resolveUserLocale } from "@/i18n/user-locale";

type ResolvedRecipient = { address: string; contactId: string | null; languageOf: RecipientUser | null };

export class MessagingAutomationEmailSender implements AutomationEmailSender {
  constructor(
    private messages: MarkdownMessageSender,
    private values: MergeValuesRepo,
    private recipients: MessageRecipientRepo,
  ) {}

  async send(args: AutomationEmail): Promise<AutomationEmailResult> {
    const actor = await this.recipients.findActingUser();
    const source = await this.values.loadMergeSource(args.record, actor?.id ?? null);
    const recipient = await this.resolveRecipient(args, source);
    if (!recipient) return { sent: false, code: "recipientMissing" };

    const rendered = renderEmailMarkdown({
      subject: args.subject,
      markdown: args.body,
      values: mergeValuesFrom(source),
    });
    if (!rendered.ok) return { sent: false, code: "mergeFieldUnresolved" };

    const locale = resolveUserLocale(recipient.languageOf ?? actor ?? { displayLanguage: null });
    const outcome = await this.messages.send({
      kind: MessageKind.transactional,
      source: "automation",
      sourceId: args.runStepId,
      automationRunStepId: args.runStepId,
      to: recipient.address,
      contactId: recipient.contactId,
      subject: rendered.email.subject,
      html: rendered.email.html,
      locale,
      bannerUrl: args.bannerUrl ?? null,
    });

    if (outcome.status === "sent") return { sent: true, to: recipient.address, duplicate: false };
    if (outcome.status === "duplicate") return { sent: true, to: recipient.address, duplicate: true };
    if (outcome.status === "failed" && outcome.code === SENDER_UNVERIFIED)
      return { sent: false, code: "senderUnverified" };

    return { sent: false, code: "emailNotSent" };
  }

  private async resolveRecipient(args: AutomationEmail, source: MergeSource): Promise<ResolvedRecipient | null> {
    if (args.recipient.kind === "address")
      return { address: args.recipient.address, contactId: null, languageOf: null };

    if (args.recipient.kind === "recordContact") {
      const contact = source.contact;

      return contact?.email ? { address: contact.email, contactId: contact.id, languageOf: null } : null;
    }

    if (!args.record) return null;

    const owner = await this.recipients.findRecordOwner(args.record);

    return owner ? { address: owner.email, contactId: null, languageOf: owner } : null;
  }
}
