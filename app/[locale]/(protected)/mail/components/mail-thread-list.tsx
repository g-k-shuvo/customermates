"use client";

import type { MailboxThreadSummaryDto } from "@/features/mailbox/mailbox.schema";

import { useTranslations } from "next-intl";

import { cn } from "@/core/utils/cn";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

type Props = {
  threads: MailboxThreadSummaryDto[];
  selectedThreadId: string | null;
  readThreadIds: string[];
  onSelect: (threadId: string) => void;
};

function participantLabel(thread: MailboxThreadSummaryDto, fallback: string): string {
  const [first] = thread.participants;
  if (!first) return fallback;

  return first.displayName ?? first.identifier;
}

export function MailThreadList({ threads, selectedThreadId, readThreadIds, onSelect }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();

  return (
    <ul
      className="flex min-h-0 w-full max-w-sm flex-col overflow-y-auto rounded-lg border"
      data-testid="mail-thread-list"
    >
      {threads.map((thread) => {
        const unread = thread.unread && !readThreadIds.includes(thread.id);

        return (
          <li key={thread.id} className="border-b last:border-b-0">
            <button
              aria-current={thread.id === selectedThreadId}
              className={cn(
                "flex w-full min-h-16 flex-col gap-1 p-3 text-left transition-colors",
                thread.id === selectedThreadId ? "bg-accent" : "hover:bg-accent/50",
              )}
              type="button"
              onClick={() => onSelect(thread.id)}
            >
              <span className="flex items-center justify-between gap-2">
                <span className={cn("truncate text-sm", unread ? "font-semibold" : "font-medium")}>
                  {participantLabel(thread, t("Mailbox.unknownSender"))}
                </span>

                {thread.lastMessageAt ? (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {intlStore.formatNumericalShortDate(thread.lastMessageAt)}
                  </span>
                ) : null}
              </span>

              <span className={cn("truncate text-sm", unread ? "font-medium" : "text-muted-foreground")}>
                {thread.subject ?? t("Mailbox.noSubject")}
              </span>

              {thread.lastMessagePreview ? (
                <span className="truncate text-xs text-muted-foreground">{thread.lastMessagePreview}</span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
