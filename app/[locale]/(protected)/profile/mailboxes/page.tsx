import { Resource } from "@/generated/prisma/client";

import { MailboxesPageView } from "./components/mailboxes-page-view";

import {
  getGetCalendarMailboxesInteractor,
  getGetMailboxAccountsInteractor,
  getGetMailLabelsInteractor,
  getMailboxOAuthSettings,
} from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";
import { configuredMailboxOAuthProviders } from "@/features/mailbox/oauth/mailbox-oauth-providers";
import { MAILBOX_OAUTH_REASON_PARAM, MAILBOX_OAUTH_RESULT_PARAM } from "@/features/mailbox/oauth/mailbox-oauth-outcome";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function single(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

export default async function ProfileMailboxesPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.inboxMessages });

  const mailboxes = await unwrapValidated(getGetMailboxAccountsInteractor().invoke());
  const labels = await getGetMailLabelsInteractor().invoke();
  const calendars = await getGetCalendarMailboxesInteractor().invoke();
  const query = await searchParams;
  const result = single(query[MAILBOX_OAUTH_RESULT_PARAM]);

  return (
    <PageContainer>
      <MailboxesPageView
        calendars={calendars.ok ? calendars.data : []}
        labels={labels.ok ? labels.data : []}
        mailboxes={mailboxes}
        oauthOutcome={result ? { result, reason: single(query[MAILBOX_OAUTH_REASON_PARAM]) } : null}
        oauthProviders={configuredMailboxOAuthProviders(getMailboxOAuthSettings())}
      />
    </PageContainer>
  );
}
