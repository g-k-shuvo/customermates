"use client";

import type { CalendarMailboxDto } from "@/features/mailbox-calendar/mailbox-calendar.schema";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { setMailboxCalendarSyncAction } from "../actions";

type Props = { calendar: CalendarMailboxDto };

export function MailboxCalendarToggle({ calendar: initial }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const [calendar, setCalendar] = useState(initial);
  const [busy, setBusy] = useState(false);
  const switchId = `mailbox-calendar-${calendar.connectedAccountId}`;

  const change = (enabled: boolean) => {
    if (busy) return;
    setBusy(true);

    runUserAction(async () => {
      try {
        const result = await setMailboxCalendarSyncAction({ connectedAccountId: calendar.connectedAccountId, enabled });
        if (!result.ok) {
          toastZodErrorTree(result.error);
          return;
        }

        setCalendar(result.data);
        toast.success(enabled ? t("MailboxCalendar.enabled") : t("MailboxCalendar.disabled"));
      } finally {
        setBusy(false);
      }
    });
  };

  return (
    <div className="flex items-start justify-between gap-3 border-t pt-2" data-mailbox-calendar="">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Label htmlFor={switchId}>{t("MailboxCalendar.label")}</Label>

        <p className="text-xs text-muted-foreground">
          {!calendar.oauth
            ? t("MailboxCalendar.needsSignIn")
            : calendar.calendarSyncEnabled && calendar.calendarSyncedAt
              ? t("MailboxCalendar.syncedAt", {
                  date: intlStore.formatNumericalShortDateTime(calendar.calendarSyncedAt),
                })
              : t("MailboxCalendar.description")}
        </p>
      </div>

      <Switch
        checked={calendar.calendarSyncEnabled}
        disabled={busy || !calendar.oauth}
        id={switchId}
        onCheckedChange={change}
      />
    </div>
  );
}
