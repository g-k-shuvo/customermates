"use client";

import type { MailboxCalendarEventDto } from "@/features/mailbox-calendar/mailbox-calendar.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { CalendarDays } from "lucide-react";
import { addDays, startOfDay } from "date-fns";

import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

export function calendarEventsOn(events: readonly MailboxCalendarEventDto[], day: Date): MailboxCalendarEventDto[] {
  const from = startOfDay(day).getTime();
  const to = addDays(startOfDay(day), 1).getTime();

  return events.filter((event) => event.startsAt.getTime() < to && event.endsAt.getTime() > from);
}

function CalendarEventChip({ event }: { event: MailboxCalendarEventDto }) {
  const t = useTranslations();
  const intl = useHydratedIntlStore();
  const label = event.title ?? t("MailboxCalendar.untitled");
  const when = event.allDay ? t("Activities.week.allDay") : intl.formatTime(event.startsAt);
  const content = (
    <>
      <CalendarDays aria-hidden="true" className="size-3 shrink-0" />

      <span className="shrink-0 tabular-nums">{when}</span>

      <span className="truncate">{label}</span>
    </>
  );
  const className =
    "flex min-w-0 items-center gap-1 rounded-md border border-dashed border-border px-1.5 py-0.5 text-[11px] text-muted-foreground";

  return event.webLink?.startsWith("https://") ? (
    <a
      className={`${className} hover:bg-accent`}
      href={event.webLink}
      rel="noopener noreferrer"
      target="_blank"
      title={label}
    >
      {content}
    </a>
  ) : (
    <span className={className} title={label}>
      {content}
    </span>
  );
}

export const WeekCalendarRow = observer(function WeekCalendarRow() {
  const t = useTranslations();
  const { taskWeekStore: store } = useRootStore();
  if (store.calendarEvents.length === 0) return null;

  return (
    <div
      className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-border/60"
      data-week-calendar-row=""
    >
      <div className="px-1 py-1.5 text-[10px] text-muted-foreground">{t("MailboxCalendar.weekRow")}</div>

      {store.days.map((day) => (
        <div key={day.toISOString()} className="flex min-w-0 flex-col gap-0.5 border-l border-border/60 p-1">
          {calendarEventsOn(store.calendarEvents, day).map((event) => (
            <CalendarEventChip key={event.id} event={event} />
          ))}
        </div>
      ))}
    </div>
  );
});

export const WeekCalendarDayList = observer(function WeekCalendarDayList() {
  const { taskWeekStore: store } = useRootStore();
  const day = store.days[store.selectedDayIndex];
  const events = day ? calendarEventsOn(store.calendarEvents, day) : [];
  if (events.length === 0) return null;

  return (
    <ul className="flex flex-col gap-1" data-week-calendar-day="">
      {events.map((event) => (
        <li key={event.id}>
          <CalendarEventChip event={event} />
        </li>
      ))}
    </ul>
  );
});
