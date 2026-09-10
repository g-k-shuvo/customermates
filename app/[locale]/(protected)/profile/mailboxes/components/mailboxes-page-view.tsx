"use client";

import type { MailboxAccountDto } from "@/features/mailbox/mailbox.schema";

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
import { disconnectMailboxAction, getMailboxAccountsAction, syncMailboxAction } from "../actions";
import { MailboxConnectForm } from "./mailbox-connect-form";
import { MailboxList } from "./mailbox-list";

type Props = {
  mailboxes: MailboxAccountDto[];
};

export function MailboxesPageView({ mailboxes }: Props) {
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
        const result = await syncMailboxAction({
          connectedAccountId: mailbox.connectedAccountId,
          batchSize: MAILBOX_DEFAULT_SYNC_BATCH_SIZE,
        });

        if (!result.ok) {
          toastZodErrorTree(result.error);
          return;
        }

        toast.success(t("Mailbox.syncSuccess", { count: result.data.messagesStored }));
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
        <MailboxList busyMailboxId={busyMailboxId} mailboxes={items} onDisconnect={disconnect} onSync={sync} />
      )}

      <MailboxConnectForm onConnected={refresh} />
    </div>
  );
}
