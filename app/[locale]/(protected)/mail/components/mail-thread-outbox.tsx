"use client";

import type { MailOutboxMessageDto } from "@/features/mail-workspace/mail-workspace.schema";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Clock, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { cancelOutboxMessageAction, sendOutboxMessageNowAction } from "../actions";

type Props = {
  messages: MailOutboxMessageDto[];
  onChanged: (options: { draftRestored: boolean }) => void;
};

export function MailThreadOutbox({ messages, onChanged }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (messages.length === 0) return null;

  const act = (id: string, kind: "cancel" | "sendNow") => {
    if (busyId) return;
    setBusyId(id);

    runUserAction(async () => {
      try {
        const result =
          kind === "cancel" ? await cancelOutboxMessageAction({ id }) : await sendOutboxMessageNowAction({ id });
        if (!result.ok) {
          toastZodErrorTree(result.error);
          return;
        }

        toast.success(kind === "cancel" ? t("Mailbox.workspace.scheduleCancelled") : t("Mailbox.workspace.sendingNow"));
        onChanged({ draftRestored: kind === "cancel" });
      } finally {
        setBusyId(null);
      }
    });
  };

  return (
    <ul className="flex flex-col gap-2 border-t px-4 pt-3" data-mail-outbox="">
      {messages.map((message) => (
        <li
          key={message.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs"
          data-mail-outbox-status={message.status}
        >
          <span className="flex min-w-0 items-center gap-2">
            {message.status === "failed" ? (
              <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0 text-destructive" />
            ) : (
              <Clock aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
            )}

            <span className="truncate">
              {message.status === "failed"
                ? t("Mailbox.workspace.outboxFailed", { count: message.attempts })
                : message.status === "sending"
                  ? t("Mailbox.workspace.outboxSending")
                  : t("Mailbox.workspace.scheduledFor", {
                      date: intlStore.formatNumericalShortDateTime(message.sendAt),
                    })}
            </span>

            {message.status === "scheduled" && message.attempts > 0 ? (
              <span className="shrink-0 text-muted-foreground">
                {t("Mailbox.workspace.outboxRetrying", { count: message.attempts })}
              </span>
            ) : null}
          </span>

          {message.status === "sending" ? null : (
            <span className="flex shrink-0 gap-1">
              <Button
                className="h-7"
                disabled={busyId !== null}
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => act(message.id, "cancel")}
              >
                {t("Mailbox.workspace.cancelScheduled")}
              </Button>

              <Button
                className="h-7"
                disabled={busyId !== null}
                size="sm"
                type="button"
                variant="secondary"
                onClick={() => act(message.id, "sendNow")}
              >
                {message.status === "failed" ? t("Mailbox.workspace.retry") : t("Mailbox.workspace.sendNow")}
              </Button>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
