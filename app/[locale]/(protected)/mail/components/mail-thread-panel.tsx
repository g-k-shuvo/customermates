"use client";

import type { MailboxMessageDto, MailboxThreadDto } from "@/features/mailbox/mailbox.schema";

import { useTranslations } from "next-intl";
import { ImageOff, MailOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageState } from "@/components/page-state/page-state";
import { cn } from "@/core/utils/cn";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { MailPageSkeleton } from "./mail-page-skeleton";
import { MailReplyBox } from "./mail-reply-box";

export type MailThreadPanelState =
  | { status: "idle" }
  | { status: "loading"; threadId: string }
  | { status: "ready"; thread: MailboxThreadDto }
  | { status: "error" };

type Props = {
  state: MailThreadPanelState;
  onShowRemoteImages: () => void;
  onReplySent: () => void;
};

function MessageBody({ message }: { message: MailboxMessageDto }) {
  if (message.bodyHtml) {
    return (
      <div
        dangerouslySetInnerHTML={{ __html: message.bodyHtml }}
        className="mail-body text-sm break-words [&_a]:underline [&_img]:max-w-full [&_table]:w-auto"
      />
    );
  }

  return <p className="text-sm whitespace-pre-wrap break-words">{message.bodyText}</p>;
}

export function MailThreadPanel({ state, onShowRemoteImages, onReplySent }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();

  if (state.status === "idle") {
    return (
      <div className="hidden min-h-0 flex-1 md:flex">
        <PageState
          background={<MailPageSkeleton animated={false} />}
          description={t("Mailbox.selectThreadDescription")}
          icon={MailOpen}
          state="empty"
          title={t("Mailbox.selectThreadTitle")}
        />
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="hidden min-h-0 flex-1 md:flex">
        <PageState background={<MailPageSkeleton />} label={t("Mailbox.loadingThread")} state="loading" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="hidden min-h-0 flex-1 md:flex">
        <PageState
          description={t("Mailbox.threadErrorDescription")}
          state="error"
          title={t("Mailbox.threadErrorTitle")}
        />
      </div>
    );
  }

  const blocked = state.thread.messages.reduce((total, message) => total + message.blockedImageCount, 0);

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">
      <header className="flex flex-col gap-1 border-b p-4">
        <h2 className="text-base font-semibold">{state.thread.subject ?? t("Mailbox.noSubject")}</h2>

        <p className="text-xs text-muted-foreground">
          {state.thread.participants.map((participant) => participant.displayName ?? participant.identifier).join(", ")}
        </p>
      </header>

      {blocked > 0 ? (
        <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2">
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <ImageOff aria-hidden="true" className="size-3.5" />

            {t("Mailbox.remoteImagesBlocked", { count: blocked })}
          </span>

          <Button className="h-7" size="sm" type="button" variant="secondary" onClick={onShowRemoteImages}>
            {t("Mailbox.showRemoteImages")}
          </Button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {state.thread.messages.map((message) => (
          <article
            key={message.id}
            className={cn("flex flex-col gap-2 rounded-lg border p-3", message.outbound && "bg-muted/40")}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-medium">
                {message.senderIdentifier ?? t("Mailbox.unknownSender")}
              </span>

              <span className="shrink-0 text-xs text-muted-foreground">
                {intlStore.formatNumericalShortDateTime(message.sentAt)}
              </span>
            </div>

            <MessageBody message={message} />
          </article>
        ))}
      </div>

      <MailReplyBox threadId={state.thread.id} onSent={onReplySent} />
    </section>
  );
}
