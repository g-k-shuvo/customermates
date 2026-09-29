"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Forward, Reply, ReplyAll } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import {
  deleteMailDraftAction,
  forwardThreadAction,
  getMailDraftAction,
  saveMailDraftAction,
  scheduleMailAction,
  sendReplyAction,
} from "../actions";
import { SEND_LATER_OPTIONS, sendLaterDateFor, type SendLaterOption } from "./mail-schedule-options";

type Props = {
  threadId: string;
  onSent: () => void;
  onScheduled?: () => void;
};

type ComposeMode = "reply" | "forward";

type Compose = { mode: ComposeMode; body: string; recipients: string; replyAll: boolean };

const RECIPIENTS_FIELD_ID = "mail-forward-recipients";
const DRAFT_SAVE_DELAY_MS = 800;
const SEND_LATER_PLACEHOLDER = "pick";
const EMPTY_COMPOSE: Compose = { mode: "reply", body: "", recipients: "", replyAll: false };

export function splitRecipients(value: string): string[] {
  return value
    .split(/[,;\s]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function MailReplyBox({ threadId, onSent, onScheduled }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const [compose, setCompose] = useState<Compose>(EMPTY_COMPOSE);
  const [sending, setSending] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { mode, body, recipients, replyAll } = compose;
  const forwarding = mode === "forward";
  const to = splitRecipients(recipients);
  const ready = forwarding ? to.length > 0 : body.trim().length > 0;
  const drafted = body.length > 0 || recipients.length > 0;

  useEffect(() => {
    let active = true;

    runUserAction(async () => {
      const result = await getMailDraftAction({ threadId });
      if (!active || !result.ok || !result.data.draft) return;

      const { draft } = result.data;
      setCompose({
        mode: draft.mode,
        body: draft.body,
        recipients: draft.recipients.join(", "),
        replyAll: draft.replyAll,
      });
      setDraftSaved(true);
    });

    return () => {
      active = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [threadId]);

  const saveDraftLater = (next: Compose) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setDraftSaved(false);

    saveTimer.current = setTimeout(() => {
      runUserAction(async () => {
        const result = await saveMailDraftAction({
          threadId,
          mode: next.mode,
          replyAll: next.replyAll,
          body: next.body,
          recipients: next.mode === "forward" ? splitRecipients(next.recipients) : [],
        });
        if (result.ok) setDraftSaved(result.data.draft !== null);
      });
    }, DRAFT_SAVE_DELAY_MS);
  };

  const change = (patch: Partial<Compose>) => {
    const next = { ...compose, ...patch };
    setCompose(next);
    saveDraftLater(next);
  };

  const cancelPendingSave = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
  };

  const clear = () => {
    cancelPendingSave();
    setCompose(EMPTY_COMPOSE);
    setDraftSaved(false);
  };

  const discard = () => {
    clear();
    runUserAction(() => deleteMailDraftAction({ threadId }));
  };

  const send = () => {
    if (!ready || sending) return;

    cancelPendingSave();
    setSending(true);

    runUserAction(async () => {
      try {
        const result = forwarding
          ? await forwardThreadAction({ threadId, to, body })
          : await sendReplyAction({ threadId, body, replyAll });

        if (!result.ok) {
          toastZodErrorTree(result.error);
          return;
        }

        toast.success(forwarding ? t("Mailbox.forwardSent") : t("Mailbox.replySent"));
        if (!result.data.sentCopySaved) toast.warning(t("Mailbox.sentCopyNotSaved"));
        clear();
        await deleteMailDraftAction({ threadId });
        onSent();
      } finally {
        setSending(false);
      }
    });
  };

  const sendLaterLabel = (option: SendLaterOption) => {
    switch (option) {
      case "inHour":
        return t("Mailbox.workspace.sendInHour");
      case "tomorrowMorning":
        return t("Mailbox.workspace.sendTomorrow");
      case "mondayMorning":
        return t("Mailbox.workspace.sendMonday");
    }
  };

  const schedule = (option: string) => {
    if (!ready || sending || option === SEND_LATER_PLACEHOLDER) return;

    cancelPendingSave();
    setSending(true);

    runUserAction(async () => {
      try {
        const result = await scheduleMailAction({
          threadId,
          mode,
          replyAll,
          body,
          recipients: forwarding ? to : [],
          sendAt: sendLaterDateFor(option as SendLaterOption, new Date()),
        });

        if (!result.ok) {
          toastZodErrorTree(result.error);
          return;
        }

        toast.success(
          t("Mailbox.workspace.scheduledFor", { date: intlStore.formatNumericalShortDateTime(result.data.sendAt) }),
        );
        clear();
        onScheduled?.();
      } finally {
        setSending(false);
      }
    });
  };

  return (
    <div className="flex flex-col gap-2 border-t p-4">
      {forwarding ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={RECIPIENTS_FIELD_ID}>{t("Mailbox.forwardRecipientsLabel")}</Label>

          <Input
            autoComplete="off"
            id={RECIPIENTS_FIELD_ID}
            placeholder={t("Mailbox.forwardRecipientsPlaceholder")}
            value={recipients}
            onChange={(event) => change({ recipients: event.target.value })}
          />

          <p className="text-xs text-muted-foreground">{t("Mailbox.forwardHint")}</p>
        </div>
      ) : null}

      <Textarea
        aria-label={forwarding ? t("Mailbox.forwardPlaceholder") : t("Mailbox.replyPlaceholder")}
        className="min-h-24"
        placeholder={forwarding ? t("Mailbox.forwardPlaceholder") : t("Mailbox.replyPlaceholder")}
        value={body}
        onChange={(event) => change({ body: event.target.value })}
      />

      <div className="flex flex-wrap items-center justify-end gap-2">
        {draftSaved ? (
          <span className="mr-auto text-xs text-muted-foreground" data-mail-draft-saved="">
            {t("Mailbox.workspace.draftSaved")}
          </span>
        ) : null}

        <Button
          className="h-8"
          disabled={sending || !drafted}
          size="sm"
          type="button"
          variant="ghost"
          onClick={discard}
        >
          {t("Mailbox.cancelReply")}
        </Button>

        {forwarding ? null : (
          <Button
            className="h-8"
            size="sm"
            type="button"
            variant={replyAll ? "softPrimary" : "secondary"}
            onClick={() => change({ replyAll: !replyAll })}
          >
            {replyAll ? (
              <ReplyAll aria-hidden="true" className="size-3.5" />
            ) : (
              <Reply aria-hidden="true" className="size-3.5" />
            )}

            {replyAll ? t("Mailbox.replyAll") : t("Mailbox.reply")}
          </Button>
        )}

        <Button
          className="h-8"
          size="sm"
          type="button"
          variant={forwarding ? "softPrimary" : "secondary"}
          onClick={() => change({ mode: forwarding ? "reply" : "forward" })}
        >
          <Forward aria-hidden="true" className="size-3.5" />

          {t("Mailbox.forward")}
        </Button>

        <Select disabled={sending || !ready} value={SEND_LATER_PLACEHOLDER} onValueChange={schedule}>
          <SelectTrigger aria-label={t("Mailbox.workspace.sendLater")} className="min-w-32" size="sm">
            <SelectValue />
          </SelectTrigger>

          <SelectContent>
            <SelectItem disabled value={SEND_LATER_PLACEHOLDER}>
              {t("Mailbox.workspace.sendLater")}
            </SelectItem>

            {SEND_LATER_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {sendLaterLabel(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button className="h-8" disabled={sending || !ready} size="sm" type="button" onClick={send}>
          {forwarding ? t("Mailbox.sendForward") : t("Mailbox.sendReply")}
        </Button>
      </div>
    </div>
  );
}
