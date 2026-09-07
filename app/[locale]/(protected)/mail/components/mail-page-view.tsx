"use client";

import type { MailboxThreadDto, MailboxThreadSummaryDto } from "@/features/mailbox/mailbox.schema";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Mail } from "lucide-react";

import { PageState } from "@/components/page-state/page-state";
import { runUserAction } from "@/core/errors/report-application-error";

import { getMailboxThreadAction } from "../actions";
import { MailPageSkeleton } from "./mail-page-skeleton";
import { MailThreadList } from "./mail-thread-list";
import { MailThreadPanel } from "./mail-thread-panel";

type Props = {
  threads: MailboxThreadSummaryDto[];
};

type PanelState =
  | { status: "idle" }
  | { status: "loading"; threadId: string }
  | { status: "ready"; thread: MailboxThreadDto }
  | { status: "error" };

export function MailPageView({ threads }: Props) {
  const t = useTranslations();
  const [panel, setPanel] = useState<PanelState>({ status: "idle" });
  const [allowRemoteImages, setAllowRemoteImages] = useState(false);
  const [readThreadIds, setReadThreadIds] = useState<string[]>([]);

  const openThread = (threadId: string, remoteImages: boolean) => {
    setPanel({ status: "loading", threadId });

    void runUserAction(async () => {
      const result = await getMailboxThreadAction({ threadId, allowRemoteImages: remoteImages });

      if (!result.ok) {
        setPanel({ status: "error" });
        return;
      }

      setPanel({ status: "ready", thread: result.data });
      setReadThreadIds((seen) => (seen.includes(threadId) ? seen : [...seen, threadId]));
    });
  };

  const showRemoteImages = () => {
    if (panel.status !== "ready") return;

    setAllowRemoteImages(true);
    openThread(panel.thread.id, true);
  };

  if (threads.length === 0) {
    return (
      <PageState
        background={<MailPageSkeleton animated={false} />}
        description={t("Mailbox.emptyDescription")}
        icon={Mail}
        state="empty"
        title={t("Mailbox.emptyTitle")}
      />
    );
  }

  const selectedId = panel.status === "loading" ? panel.threadId : panel.status === "ready" ? panel.thread.id : null;

  return (
    <div className="flex size-full min-h-0 gap-4">
      <MailThreadList
        readThreadIds={readThreadIds}
        selectedThreadId={selectedId}
        threads={threads}
        onSelect={(threadId) => openThread(threadId, allowRemoteImages)}
      />

      <MailThreadPanel
        state={panel}
        onReplySent={() => {
          if (panel.status === "ready") openThread(panel.thread.id, allowRemoteImages);
        }}
        onShowRemoteImages={showRemoteImages}
      />
    </div>
  );
}
