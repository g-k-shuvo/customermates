"use client";

import type { MailboxThreadSummaryDto } from "@/features/mailbox/mailbox.schema";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Mail } from "lucide-react";

import { PageState } from "@/components/page-state/page-state";
import { getRecordThreadsAction } from "@/app/[locale]/(protected)/mail/actions";
import { runUserAction } from "@/core/errors/report-application-error";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { useRouter } from "@/i18n/navigation";

type Props = {
  contactId?: string;
  dealId?: string;
};

type PanelState = { status: "loading" } | { status: "ready"; threads: MailboxThreadSummaryDto[] } | { status: "error" };

export function EntityEmailsPanel({ contactId, dealId }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const router = useRouter();
  const [state, setState] = useState<PanelState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });

    runUserAction(async () => {
      const result = await getRecordThreadsAction({ contactId, dealId });
      if (!active) return;

      setState(result.ok ? { status: "ready", threads: result.data } : { status: "error" });
    });

    return () => {
      active = false;
    };
  }, [contactId, dealId]);

  if (state.status === "loading")
    return <p className="p-4 text-sm text-muted-foreground">{t("Mailbox.loadingThread")}</p>;

  if (state.status === "error") {
    return (
      <PageState
        description={t("Mailbox.threadErrorDescription")}
        state="error"
        title={t("Mailbox.threadErrorTitle")}
      />
    );
  }

  if (state.threads.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <Mail aria-hidden="true" className="size-6 text-muted-foreground" />

        <p className="text-sm font-medium">{t("Mailbox.recordEmptyTitle")}</p>

        <p className="text-sm text-muted-foreground">{t("Mailbox.recordEmptyDescription")}</p>
      </div>
    );
  }

  return (
    <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {state.threads.map((thread) => (
        <li key={thread.id} className="border-b last:border-b-0">
          <button
            className="flex w-full flex-col gap-1 p-4 text-left transition-colors hover:bg-accent/50"
            type="button"
            onClick={() => router.push(`/mail?thread=${thread.id}`)}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">{thread.subject ?? t("Mailbox.noSubject")}</span>

              {thread.lastMessageAt ? (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {intlStore.formatNumericalShortDate(thread.lastMessageAt)}
                </span>
              ) : null}
            </span>

            <span className="truncate text-xs text-muted-foreground">
              {thread.participants.map((participant) => participant.displayName ?? participant.identifier).join(", ")}
            </span>

            {thread.lastMessagePreview ? (
              <span className="truncate text-xs text-muted-foreground">{thread.lastMessagePreview}</span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
