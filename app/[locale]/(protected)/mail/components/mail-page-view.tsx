"use client";

import type {
  MailboxThreadDto,
  MailboxThreadSummaryDto,
  MailThreadLabelDto,
  MailView,
} from "@/features/mailbox/mailbox.schema";
import type { MailOutboxMessageDto } from "@/features/mail-workspace/mail-workspace.schema";
import type { ThreadWorkspaceState } from "./mail-thread-workspace-bar";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Mail, MailSearch } from "lucide-react";

import { Button } from "@/components/ui/button";

import { PageState } from "@/components/page-state/page-state";
import { runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

import { getMailboxThreadAction, getMailboxThreadsAction, getMailOutboxAction } from "../actions";
import { MailPageSkeleton } from "./mail-page-skeleton";
import { MailThreadList } from "./mail-thread-list";
import { MailThreadPanel } from "./mail-thread-panel";
import { ALL_FOLDERS_VALUE, ALL_LABELS_VALUE, MailThreadToolbar } from "./mail-thread-toolbar";

type Props = {
  threads: MailboxThreadSummaryDto[];
  folders: string[];
  initialThreadId?: string;
  labels?: MailThreadLabelDto[];
  outbox?: MailOutboxMessageDto[];
};

type PanelState =
  | { status: "idle" }
  | { status: "loading"; threadId: string }
  | { status: "ready"; thread: MailboxThreadDto }
  | { status: "error" };

type AppliedFilters = { query: string; folder: string; view: MailView; labelId: string };

const NO_FILTERS: AppliedFilters = { query: "", folder: ALL_FOLDERS_VALUE, view: "inbox", labelId: ALL_LABELS_VALUE };

function isFiltered(filters: AppliedFilters): boolean {
  return (
    filters.query.length > 0 ||
    filters.folder !== ALL_FOLDERS_VALUE ||
    filters.view !== "inbox" ||
    filters.labelId !== ALL_LABELS_VALUE
  );
}

function leavesView(view: MailView, patch: Partial<ThreadWorkspaceState>): boolean {
  if (patch.archived !== undefined) return view === "inbox" ? patch.archived : view === "archived" && !patch.archived;
  if (patch.followUpAt !== undefined) return view === "followUp" && patch.followUpAt === null;

  return false;
}

function byLabelName(left: MailThreadLabelDto, right: MailThreadLabelDto): number {
  return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
}

export function MailPageView({
  threads: initialThreads,
  folders,
  initialThreadId,
  labels: initialLabels = [],
  outbox: initialOutbox = [],
}: Props) {
  const t = useTranslations();
  const [threads, setThreads] = useState(initialThreads);
  const [draft, setDraft] = useState("");
  const [applied, setApplied] = useState<AppliedFilters>(NO_FILTERS);
  const [searching, setSearching] = useState(false);
  const [panel, setPanel] = useState<PanelState>(
    initialThreadId ? { status: "loading", threadId: initialThreadId } : { status: "idle" },
  );
  const [allowRemoteImages, setAllowRemoteImages] = useState(false);
  const [readThreadIds, setReadThreadIds] = useState<string[]>([]);
  const [labels, setLabels] = useState(initialLabels);
  const [outbox, setOutbox] = useState(initialOutbox);

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

  const openThreadRef = useRef(openThread);
  openThreadRef.current = openThread;

  useEffect(() => {
    if (initialThreadId) openThreadRef.current(initialThreadId, false);
  }, [initialThreadId]);

  const showRemoteImages = () => {
    if (panel.status !== "ready") return;

    setAllowRemoteImages(true);
    openThread(panel.thread.id, true);
  };

  const applyFilters = (next: AppliedFilters) => {
    setSearching(true);

    runUserAction(async () => {
      try {
        const result = await getMailboxThreadsAction({
          query: next.query.length > 0 ? next.query : undefined,
          folder: next.folder === ALL_FOLDERS_VALUE ? undefined : next.folder,
          view: next.view,
          labelId: next.labelId === ALL_LABELS_VALUE ? undefined : next.labelId,
        });

        if (!result.ok) {
          toastZodErrorTree(result.error);
          return;
        }

        setThreads(result.data);
        setApplied(next);
      } finally {
        setSearching(false);
      }
    });
  };

  const refreshOutbox = () =>
    runUserAction(async () => {
      const result = await getMailOutboxAction();
      if (result.ok) setOutbox(result.data);
      if (applied.view === "outbox" || applied.view === "drafts") applyFilters(applied);
    });

  const applyWorkspace = (threadId: string, patch: Partial<ThreadWorkspaceState>) => {
    setThreads((current) =>
      leavesView(applied.view, patch)
        ? current.filter((thread) => thread.id !== threadId)
        : current.map((thread) => (thread.id === threadId ? { ...thread, ...patch } : thread)),
    );
    setPanel((current) =>
      current.status === "ready" && current.thread.id === threadId
        ? { status: "ready", thread: { ...current.thread, ...patch } }
        : current,
    );
  };

  const addLabel = (label: MailThreadLabelDto) =>
    setLabels((current) =>
      current.some((entry) => entry.id === label.id) ? current : [...current, label].sort(byLabelName),
    );

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

  const hasOpenThread = panel.status !== "idle";

  if (threads.length === 0 && !isFiltered(applied) && !hasOpenThread) {
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
        labelId={applied.labelId}
        labels={labels}
        searching={searching}
        view={applied.view}
        onDraftChange={setDraft}
        onFolderChange={(folder) => applyFilters({ ...applied, folder })}
        onLabelChange={(labelId) => applyFilters({ ...applied, labelId })}
        onSubmit={() => applyFilters({ ...applied, query: draft.trim() })}
        onViewChange={(view) => applyFilters({ ...applied, view })}
      />

      {threads.length === 0 && !hasOpenThread ? (
        <PageState
          background={<MailPageSkeleton animated={false} />}
          description={t("Mailbox.noMatchesDescription")}
          icon={MailSearch}
          state="empty"
          title={t("Mailbox.noMatchesTitle")}
        />
      ) : (
        <div className="flex min-h-0 flex-1 gap-4">
          <div className={selectedId ? "hidden min-h-0 w-full max-w-sm md:flex" : "flex min-h-0 w-full max-w-sm"}>
            <MailThreadList
              readThreadIds={readThreadIds}
              selectedThreadId={selectedId}
              threads={threads}
              onSelect={(threadId) => openThread(threadId, allowRemoteImages)}
            />
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
            {selectedId ? (
              <Button
                className="self-start md:hidden"
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => setPanel({ status: "idle" })}
              >
                <ArrowLeft aria-hidden="true" className="size-4" />

                {t("Mailbox.backToConversations")}
              </Button>
            ) : null}

            <MailThreadPanel
              allLabels={labels}
              outbox={outbox}
              state={panel}
              onLabelCreated={addLabel}
              onOutboxChanged={refreshOutbox}
              onReplySent={() => {
                if (panel.status === "ready") openThread(panel.thread.id, allowRemoteImages);
              }}
              onSharedChanged={applyShared}
              onShowRemoteImages={showRemoteImages}
              onWorkspaceChanged={applyWorkspace}
            />
          </div>
        </div>
      )}
    </div>
  );
}
