import { MailPageView } from "./components/mail-page-view";

import { PageContainer } from "@/components/shared/page-container";
import { getGetMailboxThreadsInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";

export default async function MailPage() {
  await requireAccess();

  const threadsResult = await getGetMailboxThreadsInteractor().invoke();

  return (
    <PageContainer>
      <div className="relative flex min-h-0 w-full flex-1 flex-col">
        <MailPageView threads={threadsResult.ok ? threadsResult.data : []} />
      </div>
    </PageContainer>
  );
}
