import { z } from "zod";

import { MailPageView } from "./components/mail-page-view";

import { PageContainer } from "@/components/shared/page-container";
import {
  getGetMailboxFoldersInteractor,
  getGetMailboxThreadsInteractor,
  getGetMailLabelsInteractor,
  getGetMailOutboxInteractor,
} from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MailPage({ searchParams }: Props) {
  await requireAccess();

  const { thread } = await searchParams;
  const initialThreadId = typeof thread === "string" && z.uuid().safeParse(thread).success ? thread : undefined;

  const threadsResult = await getGetMailboxThreadsInteractor().invoke({});
  const foldersResult = await getGetMailboxFoldersInteractor().invoke();
  const labelsResult = await getGetMailLabelsInteractor().invoke();
  const outboxResult = await getGetMailOutboxInteractor().invoke();

  return (
    <PageContainer>
      <div className="relative flex min-h-0 w-full flex-1 flex-col">
        <MailPageView
          folders={foldersResult.ok ? foldersResult.data : []}
          initialThreadId={initialThreadId}
          labels={labelsResult.ok ? labelsResult.data : []}
          outbox={outboxResult.ok ? outboxResult.data : []}
          threads={threadsResult.ok ? threadsResult.data : []}
        />
      </div>
    </PageContainer>
  );
}
