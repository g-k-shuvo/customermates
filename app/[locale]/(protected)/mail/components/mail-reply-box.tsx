"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Reply, ReplyAll } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

import { sendReplyAction } from "../actions";

type Props = {
  threadId: string;
  onSent: () => void;
};

export function MailReplyBox({ threadId, onSent }: Props) {
  const t = useTranslations();
  const [body, setBody] = useState("");
  const [replyAll, setReplyAll] = useState(false);
  const [sending, setSending] = useState(false);

  const send = () => {
    if (body.trim().length === 0 || sending) return;

    setSending(true);

    void runUserAction(async () => {
      try {
        const result = await sendReplyAction({ threadId, body, replyAll });

        if (!result.ok) {
          toastZodErrorTree(result.error);
          return;
        }

        toast.success(t("Mailbox.replySent"));
        setBody("");
        onSent();
      } finally {
        setSending(false);
      }
    });
  };

  return (
    <div className="flex flex-col gap-2 border-t p-4">
      <Textarea
        aria-label={t("Mailbox.replyPlaceholder")}
        className="min-h-24"
        placeholder={t("Mailbox.replyPlaceholder")}
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />

      <div className="flex items-center justify-end gap-2">
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

        <Button className="h-8" disabled={sending || body.trim().length === 0} size="sm" type="button" onClick={send}>
          {t("Mailbox.sendReply")}
        </Button>
      </div>
    </div>
  );
}
