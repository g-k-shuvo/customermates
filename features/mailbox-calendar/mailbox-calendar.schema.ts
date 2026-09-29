import { z } from "zod";

export const CALENDAR_PAST_DAYS = 90;
export const CALENDAR_FUTURE_DAYS = 365;
export const CALENDAR_SYNC_PAGES = 10;
export const CALENDAR_ENABLE_PAGES = 3;
export const CALENDAR_MAX_WINDOW_DAYS = 62;
export const CONTACT_MEETINGS_LIMIT = 50;

export const CalendarAttendeeDtoSchema = z.object({
  email: z.string(),
  name: z.string().nullable(),
  response: z.string().nullable(),
});

export const MailboxCalendarEventDtoSchema = z.object({
  id: z.uuid(),
  connectedAccountId: z.uuid(),
  title: z.string().nullable(),
  location: z.string().nullable(),
  startsAt: z.date(),
  endsAt: z.date(),
  allDay: z.boolean(),
  organizerEmail: z.string().nullable(),
  attendees: z.array(CalendarAttendeeDtoSchema).catch([]),
  webLink: z.string().nullable(),
});

export type MailboxCalendarEventDto = z.infer<typeof MailboxCalendarEventDtoSchema>;

export const CalendarMailboxDtoSchema = z.object({
  connectedAccountId: z.uuid(),
  emailAddress: z.string(),
  oauth: z.boolean(),
  calendarSyncEnabled: z.boolean(),
  calendarSyncedAt: z.date().nullable(),
});

export type CalendarMailboxDto = z.infer<typeof CalendarMailboxDtoSchema>;

export const SyncMailboxCalendarSchema = z.object({
  connectedAccountId: z.uuid(),
  maxPages: z.number().int().min(1).max(50).default(CALENDAR_SYNC_PAGES),
});

export type SyncMailboxCalendarData = z.infer<typeof SyncMailboxCalendarSchema>;

export const CalendarSyncOutcomeSchema = z.object({
  connectedAccountId: z.uuid(),
  stored: z.number().int().nonnegative(),
  removed: z.number().int().nonnegative(),
  complete: z.boolean(),
});

export type CalendarSyncOutcome = z.infer<typeof CalendarSyncOutcomeSchema>;

export const SetMailboxCalendarSyncSchema = z.object({
  connectedAccountId: z.uuid(),
  enabled: z.boolean(),
});

export type SetMailboxCalendarSyncData = z.infer<typeof SetMailboxCalendarSyncSchema>;

export const GetCalendarEventsSchema = z
  .object({ from: z.coerce.date(), to: z.coerce.date() })
  .refine((window) => window.to > window.from, { path: ["to"] })
  .refine((window) => window.to.getTime() - window.from.getTime() <= CALENDAR_MAX_WINDOW_DAYS * 86_400_000, {
    path: ["to"],
  });

export type GetCalendarEventsData = z.infer<typeof GetCalendarEventsSchema>;

export const ContactMeetingsSchema = z.object({ contactId: z.uuid() });

export type ContactMeetingsData = z.infer<typeof ContactMeetingsSchema>;
