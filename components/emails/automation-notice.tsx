import { EmailLayout, type EmailLayoutSharedProps } from "@/components/emails/base/email-layout";
import { EmailText } from "@/components/emails/base/email-text";
import { PREVIEW_EMAIL_LAYOUT_PROPS } from "@/components/emails/preview-layout-props";

type Props = EmailLayoutSharedProps & {
  subject: string;
  body: string;
};

const PREVIEW_SUBJECT = "Follow up on Analytical Engines";
const PREVIEW_BODY = "The deal moved to Under Contract.\nReview the next step when you have a moment.";

export default function AutomationNotice({ subject, body, ...layoutProps }: Props) {
  return (
    <EmailLayout {...layoutProps} preview={subject} title={subject}>
      {body.split("\n").map((paragraph, index) => (
        <EmailText key={`${index}-${paragraph.slice(0, 12)}`}>{paragraph}</EmailText>
      ))}
    </EmailLayout>
  );
}

AutomationNotice.PreviewProps = {
  ...PREVIEW_EMAIL_LAYOUT_PROPS,
  subject: PREVIEW_SUBJECT,
  body: PREVIEW_BODY,
} satisfies Props;
