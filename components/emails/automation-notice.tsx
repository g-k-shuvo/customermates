import { EmailLayout, type EmailLayoutSharedProps } from "@/components/emails/base/email-layout";
import { EmailText } from "@/components/emails/base/email-text";

type Props = EmailLayoutSharedProps & {
  subject: string;
  body: string;
};

export default function AutomationNotice({ subject, body, ...layoutProps }: Props) {
  return (
    <EmailLayout {...layoutProps} preview={subject} title={subject}>
      {body.split("\n").map((paragraph, index) => (
        <EmailText key={`${index}-${paragraph.slice(0, 12)}`}>{paragraph}</EmailText>
      ))}
    </EmailLayout>
  );
}
