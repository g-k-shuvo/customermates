import { Resource } from "@/generated/prisma/client";

import { MailboxesPageView } from "./components/mailboxes-page-view";

import { getGetMailboxAccountsInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

export default async function ProfileMailboxesPage() {
  await requireAccess({ resource: Resource.inboxMessages });

  const mailboxes = await unwrapValidated(getGetMailboxAccountsInteractor().invoke());

  return (
    <PageContainer>
      <MailboxesPageView mailboxes={mailboxes} />
    </PageContainer>
  );
}
