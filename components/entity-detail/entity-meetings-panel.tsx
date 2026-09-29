"use client";

import type { MailboxCalendarEventDto } from "@/features/mailbox-calendar/mailbox-calendar.schema";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarDays } from "lucide-react";

import { PageState } from "@/components/page-state/page-state";
import { getContactMeetingsAction } from "@/app/[locale]/(protected)/calendar/actions";
import { runUserAction } from "@/core/errors/report-application-error";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

type PanelState = { status: "loading" } | { status: "ready"; events: MailboxCalendarEventDto[] } | { status: "error" };

export function EntityMeetingsPanel({ contactId }: { contactId: string }) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const [state, setState] = useState<PanelState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });

    runUserAction(async () => {
      const result = await getContactMeetingsAction({ contactId });
      if (!active) return;

      setState(result.ok ? { status: "ready", events: result.data.events } : { status: "error" });
    });

    return () => {
      active = false;
    };
  }, [contactId]);

  if (state.status === "loading")
    return <p className="p-4 text-sm text-muted-foreground">{t("MailboxCalendar.loading")}</p>;

  if (state.status === "error") {
    return (
      <PageState
        description={t("MailboxCalendar.errorDescription")}
        state="error"
        title={t("MailboxCalendar.errorTitle")}
      />
    );
  }

  if (state.events.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center" data-meetings-empty="">
        <CalendarDays aria-hidden="true" className="size-6 text-muted-foreground" />

        <p className="text-sm font-medium">{t("MailboxCalendar.emptyTitle")}</p>

        <p className="text-sm text-muted-foreground">{t("MailboxCalendar.emptyDescription")}</p>
      </div>
    );
  }

  return (
    <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-meetings="">
      {state.events.map((event) => (
        <li key={event.id} className="flex flex-col gap-1 border-b p-4 last:border-b-0">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium">{event.title ?? t("MailboxCalendar.untitled")}</span>

            <span className="shrink-0 text-xs text-muted-foreground">
              {event.allDay
                ? intlStore.formatNumericalShortDate(event.startsAt)
                : intlStore.formatNumericalShortDateTime(event.startsAt)}
            </span>
          </span>

          {event.location ? <span className="truncate text-xs text-muted-foreground">{event.location}</span> : null}

          <span className="truncate text-xs text-muted-foreground">
            {event.attendees.map((attendee) => attendee.name ?? attendee.email).join(", ")}
          </span>
        </li>
      ))}
    </ul>
  );
}
