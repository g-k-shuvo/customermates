"use client";

import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";

export const PendingInvitationsList = observer(() => {
  const t = useTranslations();
  const { pendingInvitationsStore: store } = useRootStore();
  const intlStore = useHydratedIntlStore();

  useEffect(() => {
    store.load().catch(reportApplicationError);
  }, [store]);

  if (store.items.length === 0) return null;

  const now = Date.now();

  return (
    <section className="mt-4 flex flex-col gap-2 border-t border-border pt-3" data-pending-invitations="">
      <h3 className="text-sm font-medium">{t("CompanyInviteModal.pending.title")}</h3>

      <ul className="flex flex-col divide-y divide-border">
        {store.items.map((invitation) => {
          const expired = invitation.expiresAt.getTime() <= now;
          const isBusy = store.busyId === invitation.id;

          return (
            <li key={invitation.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm">{invitation.email}</span>

                <span className="text-xs text-muted-foreground">
                  {expired
                    ? t("CompanyInviteModal.pending.sentExpired", {
                        sent: intlStore.formatDescriptiveShortDate(invitation.sentAt),
                      })
                    : t("CompanyInviteModal.pending.sentExpires", {
                        sent: intlStore.formatDescriptiveShortDate(invitation.sentAt),
                        expires: intlStore.formatDescriptiveShortDate(invitation.expiresAt),
                      })}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  disabled={isBusy}
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => runUserAction(() => store.resend(invitation.id))}
                >
                  {t("CompanyInviteModal.pending.resend")}
                </Button>

                <Button
                  className="text-destructive"
                  disabled={isBusy}
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => runUserAction(() => store.revoke(invitation.id))}
                >
                  {t("CompanyInviteModal.pending.revoke")}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
});
