import type { EmailService } from "@/features/email/email.service";
import type { SigningRecipientState } from "@/core/signing/signing-provider";
import type { EnvelopeRecordDocument } from "./record-document-signing.repo";

import { createElement } from "react";

import DocumentSignedNotice from "@/components/emails/document-signed-notice";
import { getEmailLayoutCopy } from "@/components/emails/base/email-layout-copy";
import { env } from "@/env";
import { getTranslator } from "@/i18n/get-translator";
import { resolveUserLocale } from "@/i18n/user-locale";

const RECORD_PATH = { contact: "contacts", organization: "organizations", deal: "deals" } as const;

export class DocumentSignedNotifier {
  constructor(private emailService: EmailService) {}

  async notify(
    document: Pick<EnvelopeRecordDocument, "entityType" | "recordId" | "title" | "creator">,
    recipients: readonly SigningRecipientState[],
  ): Promise<void> {
    if (!document.creator) return;

    const locale = resolveUserLocale(document.creator);
    const t = await getTranslator(locale, "DocumentSignedNotice");
    const layoutCopy = await getEmailLayoutCopy(locale);
    const recordLink = `${env.BASE_URL}/${RECORD_PATH[document.entityType]}/${document.recordId}`;
    const names = recipients.map((recipient) => recipient.name).join(", ");
    const subject = t("subject", { title: document.title });

    await this.emailService.send({
      to: document.creator.email,
      subject,
      react: createElement(DocumentSignedNotice, {
        locale,
        layoutCopy,
        recordLink,
        subject,
        preview: t("preview", { title: document.title }),
        intro: t("intro", { title: document.title }),
        signers: names ? t("signers", { names }) : null,
        cta: t("cta"),
        fallback: t("fallback"),
      }),
    });
  }
}
