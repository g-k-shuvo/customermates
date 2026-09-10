"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Forward, Reply, ReplyAll } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

import { forwardThreadAction, sendReplyAction } from "../actions";

type Props = {
  threadId: string;
  onSent: () => void;
};

type ComposeMode = "reply" | "forward";

const RECIPIENTS_FIELD_ID = "mail-forward-recipients";

export function splitRecipients(value: string): string[] {
  return value
    .split(/[,;\s]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function MailReplyBox({ threadId, onSent }: Props) {
  const t = useTranslations();
  const [mode, setMode] = useState<ComposeMode>("reply");
  const [body, setBody] = useState("");
  const [recipients, setRecipients] = useState("");
  const [replyAll, setReplyAll] = useState(false);
  const [sending, setSending] = useState(false);

  const forwarding = mode === "forward";
  const to = splitRecipients(recipients);
  const ready = forwarding ? to.length > 0 : body.trim().length > 0;
  const drafted = body.length > 0 || recipients.length > 0;

  const discard = () => {
    setBody("");
    setRecipients("");
    setReplyAll(false);
    setMode("reply");
  };

  const send = () => {
    if (!ready || sending) return;

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
        setBody("");
        setRecipients("");
        onSent();
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
            onChange={(event) => setRecipients(event.target.value)}
          />

          <p className="text-xs text-muted-foreground">{t("Mailbox.forwardHint")}</p>
        </div>
      ) : null}

      <Textarea
        aria-label={forwarding ? t("Mailbox.forwardPlaceholder") : t("Mailbox.replyPlaceholder")}
        className="min-h-24"
        placeholder={forwarding ? t("Mailbox.forwardPlaceholder") : t("Mailbox.replyPlaceholder")}
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />

      <div className="flex flex-wrap items-center justify-end gap-2">
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
            onClick={() => setReplyAll((current) => !current)}
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
          onClick={() => setMode(forwarding ? "reply" : "forward")}
        >
          <Forward aria-hidden="true" className="size-3.5" />

          {t("Mailbox.forward")}
        </Button>

        <Button className="h-8" disabled={sending || !ready} size="sm" type="button" onClick={send}>
          {forwarding ? t("Mailbox.sendForward") : t("Mailbox.sendReply")}
        </Button>
      </div>
    </div>
  );
}
