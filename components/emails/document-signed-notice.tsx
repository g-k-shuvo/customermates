import { brandedEnMessages as enMessages } from "@/i18n/brand-messages";
import { EmailButton } from "@/components/emails/base/email-button";
import { EmailLayout, type EmailLayoutSharedProps } from "@/components/emails/base/email-layout";
import { EmailLink } from "@/components/emails/base/email-link";
import { EmailSection } from "@/components/emails/base/email-section";
import { EmailText } from "@/components/emails/base/email-text";
import { PREVIEW_EMAIL_LAYOUT_PROPS } from "@/components/emails/preview-layout-props";
import { env } from "@/env";

type Props = EmailLayoutSharedProps & {
  recordLink: string;
  subject: string;
  preview: string;
  intro: string;
  signers: string | null;
  cta: string;
  fallback: string;
};

export default function DocumentSignedNotice({
  recordLink,
  subject,
  preview,
  intro,
  signers,
  cta,
  fallback,
  ...layoutProps
}: Props) {
  return (
    <EmailLayout {...layoutProps} preview={preview} title={subject}>
      <EmailText>{intro}</EmailText>

      {signers ? <EmailText className="text-sm text-default-700">{signers}</EmailText> : null}

      <EmailSection>
        <EmailButton href={recordLink}>{cta}</EmailButton>
      </EmailSection>

      <EmailText className="text-sm text-default-700">
        {fallback}

        <EmailLink href={recordLink}>{recordLink}</EmailLink>
      </EmailText>
    </EmailLayout>
  );
}

const t = enMessages.DocumentSignedNotice;
const previewTitle = "Mutual NDA — Analytical Engines";

DocumentSignedNotice.PreviewProps = {
  ...PREVIEW_EMAIL_LAYOUT_PROPS,
  recordLink: `${env.BASE_URL}/deals/example-deal-id`,
  subject: t.subject.replace("{title}", previewTitle),
  preview: t.preview.replace("{title}", previewTitle),
  intro: t.intro.replace("{title}", previewTitle),
  signers: t.signers.replace("{names}", "Ada Lovelace, Charles Babbage"),
  cta: t.cta,
  fallback: t.fallback,
} satisfies Props;
