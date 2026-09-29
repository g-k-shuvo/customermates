"use client";

import type { MailboxAccountDto } from "@/features/mailbox/mailbox.schema";
import type { MailboxOAuthProvider } from "@/generated/prisma";
import type { MailThreadLabelDto } from "@/features/mailbox/mailbox.schema";
import type { CalendarMailboxDto } from "@/features/mailbox-calendar/mailbox-calendar.schema";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Mail } from "lucide-react";
import { toast } from "sonner";

import { Alert } from "@/components/shared/alert";
import { PageState } from "@/components/page-state/page-state";
import { runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { MAILBOX_DEFAULT_SYNC_BATCH_SIZE } from "@/features/mailbox/mailbox.schema";

import { MailboxesPageSkeleton } from "../../components/profile-resource-page-skeleton";
import {
  disconnectMailboxAction,
  getMailboxAccountsAction,
  listSyncFoldersAction,
  syncMailboxAction,
} from "../actions";
import { MailboxConnectForm } from "./mailbox-connect-form";
import { MailboxList } from "./mailbox-list";
import { MailboxOAuthConnect, type MailboxOAuthOutcome } from "./mailbox-oauth-connect";
import { MailLabelsCard } from "./mail-labels-card";

type Props = {
  mailboxes: MailboxAccountDto[];
  oauthProviders?: readonly MailboxOAuthProvider[];
  oauthOutcome?: MailboxOAuthOutcome;
  labels?: MailThreadLabelDto[];
  calendars?: CalendarMailboxDto[];
};

export function MailboxesPageView({
  mailboxes,
  oauthProviders = [],
  oauthOutcome = null,
  labels = [],
  calendars = [],
}: Props) {
  const t = useTranslations();
  const { showDeleteConfirmation } = useDeleteConfirmation();
  const [items, setItems] = useState(mailboxes);
  const [busyMailboxId, setBusyMailboxId] = useState<string | null>(null);

  const refresh = async () => {
    const result = await getMailboxAccountsAction();

    if (!result.ok) {
      toastZodErrorTree(result.error);
      return;
    }

    setItems(result.data);
  };

  const disconnect = (mailbox: MailboxAccountDto) =>
    showDeleteConfirmation(async () => {
      const result = await disconnectMailboxAction({ connectedAccountId: mailbox.connectedAccountId });

      if (!result.ok) {
        toastZodErrorTree(result.error);
        return false;
      }

      await refresh();
      return true;
    }, mailbox.emailAddress);

  const sync = (mailbox: MailboxAccountDto) => {
    if (busyMailboxId) return;

    setBusyMailboxId(mailbox.connectedAccountId);

    runUserAction(async () => {
      try {
        const folders = await listSyncFoldersAction({ connectedAccountId: mailbox.connectedAccountId });
        if (!folders.ok) {
          toastZodErrorTree(folders.error);
          return;
        }

        let messagesStored = 0;
        for (const folderPath of folders.data) {
          const result = await syncMailboxAction({
            connectedAccountId: mailbox.connectedAccountId,
            batchSize: MAILBOX_DEFAULT_SYNC_BATCH_SIZE,
            folderPath,
          });

          if (!result.ok) {
            toastZodErrorTree(result.error);
            return;
          }

          messagesStored += result.data.messagesStored;
        }

        toast.success(t("Mailbox.syncSuccess", { count: messagesStored }));
        await refresh();
      } finally {
        setBusyMailboxId(null);
      }
    });
  };

  return (
    <div className="animate-page-result-in flex w-full max-w-3xl flex-col gap-4 motion-reduce:animate-none">
      <Alert color="primary" description={t("Mailbox.accountsDescription")} />

      {items.length === 0 ? (
        <PageState
          background={<MailboxesPageSkeleton animated={false} />}
          description={t("Mailbox.emptyAccountsDescription")}
          icon={Mail}
          state="empty"
          title={t("Mailbox.emptyAccountsTitle")}
        />
      ) : (
        <MailboxList
          busyMailboxId={busyMailboxId}
          calendars={calendars}
          mailboxes={items}
          onDisconnect={disconnect}
          onSync={sync}
        />
      )}

      <MailboxOAuthConnect outcome={oauthOutcome} providers={oauthProviders} />

      <MailboxConnectForm onConnected={refresh} />

      <MailLabelsCard labels={labels} />
    </div>
  );
}
