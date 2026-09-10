"use client";

import type { MailboxAccountDto } from "@/features/mailbox/mailbox.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InfoRow } from "@/components/shared/info-row";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { PROFILE_RESOURCE_CARD_GRID_CLASS_NAME } from "../../components/profile-resource-page-geometry";

function smtpTargetOf(mailbox: MailboxAccountDto): string | null {
  if (!mailbox.smtpHost) return null;
  if (mailbox.smtpPort === null) return mailbox.smtpHost;

  return `${mailbox.smtpHost}:${mailbox.smtpPort}`;
}

type Props = {
  busyMailboxId: string | null;
  mailboxes: MailboxAccountDto[];
  onDisconnect: (mailbox: MailboxAccountDto) => void;
  onSync: (mailbox: MailboxAccountDto) => void;
};

export const MailboxList = observer(({ busyMailboxId, mailboxes, onDisconnect, onSync }: Props) => {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();

  return (
    <div className={PROFILE_RESOURCE_CARD_GRID_CLASS_NAME}>
      {mailboxes.map((mailbox) => {
        const isBusy = busyMailboxId === mailbox.connectedAccountId;
        const smtpTarget = smtpTargetOf(mailbox);

        return (
          <Card key={mailbox.id} className="gap-3 py-4">
            <CardContent className="flex flex-col gap-2 px-4">
              <p className="truncate text-sm font-medium">{mailbox.displayName ?? mailbox.emailAddress}</p>

              <InfoRow label={t("Common.table.columns.emailAddress")}>{mailbox.emailAddress}</InfoRow>

              <InfoRow label={t("Mailbox.imapHostLabel")}>{`${mailbox.imapHost}:${mailbox.imapPort}`}</InfoRow>

              <InfoRow label={t("Mailbox.smtpHostLabel")}>{smtpTarget ?? t("Mailbox.sendingOff")}</InfoRow>

              <InfoRow label={t("Mailbox.lastSyncedLabel")}>
                {mailbox.lastSyncedAt
                  ? intlStore.formatNumericalShortDateTime(mailbox.lastSyncedAt)
                  : t("Common.never")}
              </InfoRow>

              <InfoRow label={t("Mailbox.lastVerifiedLabel")}>
                {mailbox.lastVerifiedAt
                  ? intlStore.formatNumericalShortDateTime(mailbox.lastVerifiedAt)
                  : t("Common.never")}
              </InfoRow>

              <div className="mt-1 flex items-center justify-end gap-2">
                <Button disabled={isBusy} size="xs" type="button" variant="secondary" onClick={() => onSync(mailbox)}>
                  <RefreshCw aria-hidden="true" className="size-3.5" />

                  {t("Mailbox.syncNow")}
                </Button>

                <Button
                  aria-label={t("Mailbox.disconnectLabel", { address: mailbox.emailAddress })}
                  disabled={isBusy}
                  size="xs"
                  type="button"
                  variant="ghost"
                  onClick={() => onDisconnect(mailbox)}
                >
                  <Trash2 aria-hidden="true" className="size-3.5" />

                  {t("Mailbox.disconnect")}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
});
