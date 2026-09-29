import { brandedEnMessages as enMessages } from "@/i18n/brand-messages";
import { EmailLayout, type EmailLayoutSharedProps } from "@/components/emails/base/email-layout";
import { EmailImage } from "@/components/emails/base/email-image";
import { EmailLink } from "@/components/emails/base/email-link";
import { EmailText } from "@/components/emails/base/email-text";
import { PREVIEW_EMAIL_LAYOUT_PROPS } from "@/components/emails/preview-layout-props";

type Props = EmailLayoutSharedProps & {
  subject: string;
  html: string;
  unsubscribe: { label: string; href: string } | null;
  bannerUrl?: string | null;
};

export default function CampaignMessage({ subject, html, unsubscribe, bannerUrl, ...layoutProps }: Props) {
  return (
    <EmailLayout {...layoutProps} preview={subject} title={subject}>
      {bannerUrl ? (
        <EmailImage
          alt=""
          src={bannerUrl}
          style={{ display: "block", width: "100%", maxWidth: "100%", height: "auto", margin: "0 0 24px", border: 0 }}
        />
      ) : null}

      <div dangerouslySetInnerHTML={{ __html: html }} />

      {unsubscribe ? (
        <EmailText className="text-sm text-default-700">
          <EmailLink href={unsubscribe.href}>{unsubscribe.label}</EmailLink>
        </EmailText>
      ) : null}
    </EmailLayout>
  );
}

CampaignMessage.PreviewProps = {
  ...PREVIEW_EMAIL_LAYOUT_PROPS,
  subject: "Your proposal for Analytical Engines",
  html: '<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#1f2328;">Hi Ada,</p><p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#1f2328;">The proposal for <strong>Analytical Engines</strong> is ready for your review.</p>',
  unsubscribe: {
    label: enMessages.CampaignMessage.unsubscribe,
    href: "https://preview.example.test/api/unsubscribe/token",
  },
} satisfies Props;
