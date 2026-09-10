"use client";

import type { MailboxMessageDto, MailboxThreadDealLinkDto, MailboxThreadDto } from "@/features/mailbox/mailbox.schema";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ImageOff, MailOpen } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { EntityType } from "@/generated/prisma";
import { Label } from "@/components/ui/label";
import { PageState } from "@/components/page-state/page-state";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/core/utils/cn";
import { runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { linkThreadDealAction, shareThreadAction } from "../actions";
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
  onSharedChanged: (threadId: string, shared: boolean) => void;
};

const SHARE_SWITCH_ID = "mail-thread-share";

const UNLINKED: MailboxThreadDealLinkDto = {
  linkedDealId: null,
  linkedDealName: null,
  offeredDealId: null,
  offeredDealName: null,
  openDealCount: 0,
};

type DealLinkOverride = { threadId: string; link: MailboxThreadDealLinkDto };

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

export function MailThreadPanel({ state, onShowRemoteImages, onReplySent, onSharedChanged }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { singular, plural } = useEntityTerminology();
  const [sharing, setSharing] = useState(false);
  const [linking, setLinking] = useState(false);
  const [dealLinkOverride, setDealLinkOverride] = useState<DealLinkOverride | null>(null);

  const loadingThreadId = state.status === "loading" ? state.threadId : null;
  const [trackedLoad, setTrackedLoad] = useState<string | null>(loadingThreadId);

  if (trackedLoad !== loadingThreadId) {
    setTrackedLoad(loadingThreadId);
    if (loadingThreadId !== null) setDealLinkOverride(null);
  }

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

  const thread = state.thread;
  const blocked = thread.messages.reduce((total, message) => total + message.blockedImageCount, 0);
  const dealLink = dealLinkOverride?.threadId === thread.id ? dealLinkOverride.link : thread.dealLink;
  const dealName = dealLink.linkedDealName ?? dealLink.offeredDealName ?? t("Mailbox.dealUnnamed");
  const matchedEntity = thread.matchedContactCount === 1 ? singular(EntityType.contact) : plural(EntityType.contact);

  const changeShared = (shared: boolean) => {
    setSharing(true);

    runUserAction(async () => {
      try {
        const result = await shareThreadAction({ threadId: thread.id, shared });

        if (!result.ok) {
          toastZodErrorTree(result.error);
          return;
        }

        if (!result.data.sharedToCrm) setDealLinkOverride({ threadId: thread.id, link: UNLINKED });

        onSharedChanged(thread.id, result.data.sharedToCrm);
        toast.success(result.data.sharedToCrm ? t("Mailbox.shareEnabled") : t("Mailbox.shareDisabled"));
      } finally {
        setSharing(false);
      }
    });
  };

  const changeDeal = (dealId: string | null) => {
    setLinking(true);

    runUserAction(async () => {
      try {
        const result = await linkThreadDealAction({ threadId: thread.id, dealId });

        if (!result.ok) {
          toastZodErrorTree(result.error);
          return;
        }

        setDealLinkOverride({ threadId: thread.id, link: result.data.dealLink });
        onSharedChanged(thread.id, result.data.sharedToCrm);
        toast.success(dealId === null ? t("Mailbox.dealUnlinked") : t("Mailbox.dealLinked", { name: dealName }));
      } finally {
        setLinking(false);
      }
    });
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">
      <header className="flex flex-col gap-1 border-b p-4">
        <h2 className="text-base font-semibold">{thread.subject ?? t("Mailbox.noSubject")}</h2>

        <p className="text-xs text-muted-foreground">
          {thread.participants.map((participant) => participant.displayName ?? participant.identifier).join(", ")}
        </p>
      </header>

      <div className="flex items-start justify-between gap-3 border-b bg-muted/40 px-4 py-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Label htmlFor={SHARE_SWITCH_ID}>{t("Mailbox.shareLabel")}</Label>

          <p className="text-xs text-muted-foreground">
            {thread.sharedToCrm
              ? t("Mailbox.shareDescriptionOn")
              : thread.matchedContactCount > 0
                ? t("Mailbox.shareOfferDescription", { count: thread.matchedContactCount, entity: matchedEntity })
                : t("Mailbox.shareDescriptionOff")}
          </p>
        </div>

        <Switch
          checked={thread.sharedToCrm}
          disabled={sharing}
          id={SHARE_SWITCH_ID}
          onCheckedChange={(next) => changeShared(next)}
        />
      </div>

      {dealLink.linkedDealId !== null || dealLink.offeredDealId !== null || dealLink.openDealCount > 1 ? (
        <div className="flex items-start justify-between gap-3 border-b bg-muted/40 px-4 py-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-medium">
              {t("Mailbox.dealLinkLabel", { entity: singular(EntityType.deal) })}
            </span>

            <p className="text-xs text-muted-foreground">
              {dealLink.linkedDealId !== null
                ? t("Mailbox.dealLinkedDescription", { name: dealName })
                : dealLink.offeredDealId !== null
                  ? t("Mailbox.dealOfferDescription", { name: dealName, entity: singular(EntityType.deal) })
                  : t("Mailbox.dealAmbiguousDescription", {
                      count: dealLink.openDealCount,
                      entity: plural(EntityType.deal),
                    })}
            </p>
          </div>

          {dealLink.linkedDealId !== null ? (
            <Button
              className="h-7 shrink-0"
              disabled={linking}
              size="sm"
              type="button"
              variant="secondary"
              onClick={() => changeDeal(null)}
            >
              {t("Mailbox.dealUnlink")}
            </Button>
          ) : null}

          {dealLink.linkedDealId === null && dealLink.offeredDealId !== null ? (
            <Button
              className="h-7 shrink-0"
              disabled={linking}
              size="sm"
              type="button"
              onClick={() => changeDeal(dealLink.offeredDealId)}
            >
              {t("Mailbox.dealLinkConfirm")}
            </Button>
          ) : null}
        </div>
      ) : null}

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
        {thread.messages.map((message) => (
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

      <MailReplyBox threadId={thread.id} onSent={onReplySent} />
    </section>
  );
}
