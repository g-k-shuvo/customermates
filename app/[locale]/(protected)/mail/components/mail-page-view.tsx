"use client";

import type { MailboxThreadDto, MailboxThreadSummaryDto } from "@/features/mailbox/mailbox.schema";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Mail, MailSearch } from "lucide-react";

import { PageState } from "@/components/page-state/page-state";
import { runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

import { getMailboxThreadAction, getMailboxThreadsAction } from "../actions";
import { MailPageSkeleton } from "./mail-page-skeleton";
import { MailThreadList } from "./mail-thread-list";
import { MailThreadPanel } from "./mail-thread-panel";
import { ALL_FOLDERS_VALUE, MailThreadToolbar } from "./mail-thread-toolbar";

type Props = {
  threads: MailboxThreadSummaryDto[];
  folders: string[];
};

type PanelState =
  | { status: "idle" }
  | { status: "loading"; threadId: string }
  | { status: "ready"; thread: MailboxThreadDto }
  | { status: "error" };

type AppliedFilters = { query: string; folder: string };

const NO_FILTERS: AppliedFilters = { query: "", folder: ALL_FOLDERS_VALUE };

function isFiltered(filters: AppliedFilters): boolean {
  return filters.query.length > 0 || filters.folder !== ALL_FOLDERS_VALUE;
}

export function MailPageView({ threads: initialThreads, folders }: Props) {
  const t = useTranslations();
  const [threads, setThreads] = useState(initialThreads);
  const [draft, setDraft] = useState("");
  const [applied, setApplied] = useState<AppliedFilters>(NO_FILTERS);
  const [searching, setSearching] = useState(false);
  const [panel, setPanel] = useState<PanelState>({ status: "idle" });
  const [allowRemoteImages, setAllowRemoteImages] = useState(false);
  const [readThreadIds, setReadThreadIds] = useState<string[]>([]);

  const openThread = (threadId: string, remoteImages: boolean) => {
    setPanel({ status: "loading", threadId });

    runUserAction(async () => {
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

  const applyFilters = (query: string, folder: string) => {
    setSearching(true);

    runUserAction(async () => {
      try {
        const result = await getMailboxThreadsAction({
          query: query.length > 0 ? query : undefined,
          folder: folder === ALL_FOLDERS_VALUE ? undefined : folder,
        });

        if (!result.ok) {
          toastZodErrorTree(result.error);
          return;
        }

        setThreads(result.data);
        setApplied({ query, folder });
      } finally {
        setSearching(false);
      }
    });
  };

  const applyShared = (threadId: string, shared: boolean) => {
    setThreads((current) =>
      current.map((thread) => (thread.id === threadId ? { ...thread, sharedToCrm: shared } : thread)),
    );
    setPanel((current) =>
      current.status === "ready" && current.thread.id === threadId
        ? { status: "ready", thread: { ...current.thread, sharedToCrm: shared } }
        : current,
    );
  };

  if (threads.length === 0 && !isFiltered(applied)) {
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
    <div className="flex size-full min-h-0 flex-col gap-3">
      <MailThreadToolbar
        draft={draft}
        folder={applied.folder}
        folders={folders}
        searching={searching}
        onDraftChange={setDraft}
        onFolderChange={(folder) => applyFilters(applied.query, folder)}
        onSubmit={() => applyFilters(draft.trim(), applied.folder)}
      />

      {threads.length === 0 ? (
        <PageState
          background={<MailPageSkeleton animated={false} />}
          description={t("Mailbox.noMatchesDescription")}
          icon={MailSearch}
          state="empty"
          title={t("Mailbox.noMatchesTitle")}
        />
      ) : (
        <div className="flex min-h-0 flex-1 gap-4">
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
            onSharedChanged={applyShared}
            onShowRemoteImages={showRemoteImages}
          />
        </div>
      )}
    </div>
  );
}
