import { brandedEnMessages as enMessages } from "@/i18n/brand-messages";
import { EmailButton } from "@/components/emails/base/email-button";
import { EmailLayout, type EmailLayoutSharedProps } from "@/components/emails/base/email-layout";
import { EmailLink } from "@/components/emails/base/email-link";
import { EmailSection } from "@/components/emails/base/email-section";
import { EmailText } from "@/components/emails/base/email-text";
import { PREVIEW_EMAIL_LAYOUT_PROPS } from "@/components/emails/preview-layout-props";
import { env } from "@/env";

type Props = EmailLayoutSharedProps & {
  leadLink: string;
  subject: string;
  preview: string;
  intro: string;
  person: string | null;
  organization: string | null;
  cta: string;
  fallback: string;
};

export default function LeadCreatedNotice({
  leadLink,
  subject,
  preview,
  intro,
  person,
  organization,
  cta,
  fallback,
  ...layoutProps
}: Props) {
  return (
    <EmailLayout {...layoutProps} preview={preview} title={subject}>
      <EmailText>{intro}</EmailText>

      {person ? <EmailText className="text-sm text-default-700">{person}</EmailText> : null}

      {organization ? <EmailText className="text-sm text-default-700">{organization}</EmailText> : null}

      <EmailSection>
        <EmailButton href={leadLink}>{cta}</EmailButton>
      </EmailSection>

      <EmailText className="text-sm text-default-700">
        {fallback}

        <EmailLink href={leadLink}>{leadLink}</EmailLink>
      </EmailText>
    </EmailLayout>
  );
}

const t = enMessages.LeadCreatedNotice;
const previewLeadTitle = "Analytical Engines — Request a Call";
const previewSourceName = "Request a Call";

LeadCreatedNotice.PreviewProps = {
  ...PREVIEW_EMAIL_LAYOUT_PROPS,
  leadLink: `${env.BASE_URL}/leads/example-lead-id`,
  subject: t.subject.replace("{leadTitle}", previewLeadTitle),
  preview: t.preview.replace("{sourceName}", previewSourceName),
  intro: t.intro.replace("{leadTitle}", previewLeadTitle).replace("{sourceName}", previewSourceName),
  person: t.person.replace("{personName}", "Ada Lovelace"),
  organization: t.organization.replace("{organizationName}", "Analytical Engines"),
  cta: t.cta,
  fallback: t.fallback,
} satisfies Props;
