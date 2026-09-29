import { z } from "zod";

import { MailboxOAuthProvider } from "@/generated/prisma";

export type CalendarFetch = (input: string, init: RequestInit) => Promise<Response>;

export type CalendarAttendee = { email: string; name: string | null; response: string | null };

export type ProviderCalendarEvent = {
  providerEventId: string;
  title: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  cancelled: boolean;
  organizerEmail: string | null;
  attendees: CalendarAttendee[];
  webLink: string | null;
};

export type CalendarChangePage = {
  events: ProviderCalendarEvent[];
  removedIds: string[];
  nextCursor: string;
  complete: boolean;
};

export type CalendarWindow = { from: Date; to: Date };

export const CalendarSyncFailure = {
  accessMissing: "accessMissing",
  cursorExpired: "cursorExpired",
  providerFailed: "providerFailed",
} as const;

export type CalendarSyncFailure = (typeof CalendarSyncFailure)[keyof typeof CalendarSyncFailure];

export class CalendarSyncError extends Error {
  constructor(readonly failure: CalendarSyncFailure) {
    super(failure);
    this.name = "CalendarSyncError";
  }
}

export type CalendarProviderClient = {
  fetchPage(args: {
    accessToken: string;
    cursor: string | null;
    window: CalendarWindow;
    fetcher: CalendarFetch;
  }): Promise<CalendarChangePage>;
};

const REQUEST_TIMEOUT_MS = 20_000;
const GOOGLE_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const GRAPH_DELTA_URL = "https://graph.microsoft.com/v1.0/me/calendarView/delta";
const CURSOR_PAGE = "page:";
const CURSOR_SYNC = "sync:";

async function getJson(url: string, accessToken: string, fetcher: CalendarFetch, headers: Record<string, string> = {}) {
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", ...headers },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new CalendarSyncError(CalendarSyncFailure.providerFailed);
  }

  if (response.status === 401 || response.status === 403)
    throw new CalendarSyncError(CalendarSyncFailure.accessMissing);
  if (response.status === 410) throw new CalendarSyncError(CalendarSyncFailure.cursorExpired);
  if (!response.ok) throw new CalendarSyncError(CalendarSyncFailure.providerFailed);

  return (await response.json().catch(() => null)) as unknown;
}

const GoogleTimeSchema = z.object({ dateTime: z.string().optional(), date: z.string().optional() }).optional();

const GoogleEventSchema = z.object({
  id: z.string(),
  status: z.string().optional(),
  summary: z.string().optional(),
  location: z.string().optional(),
  htmlLink: z.string().optional(),
  start: GoogleTimeSchema,
  end: GoogleTimeSchema,
  organizer: z.object({ email: z.string().optional() }).optional(),
  attendees: z
    .array(
      z.object({
        email: z.string().optional(),
        displayName: z.string().optional(),
        responseStatus: z.string().optional(),
      }),
    )
    .optional(),
});

const GooglePageSchema = z.object({
  items: z.array(z.unknown()).default([]),
  nextPageToken: z.string().optional(),
  nextSyncToken: z.string().optional(),
});

function googleTime(value: z.infer<typeof GoogleTimeSchema>): { at: Date; allDay: boolean } | null {
  if (value?.dateTime) return { at: new Date(value.dateTime), allDay: false };
  if (value?.date) return { at: new Date(`${value.date}T00:00:00Z`), allDay: true };

  return null;
}

function attendeesOf(
  list: Array<{ email?: string; name?: string | null; response?: string | null }>,
): CalendarAttendee[] {
  return list.flatMap((entry) =>
    entry.email
      ? [{ email: entry.email.toLowerCase(), name: entry.name ?? null, response: entry.response ?? null }]
      : [],
  );
}

export const googleCalendarClient: CalendarProviderClient = {
  async fetchPage({ accessToken, cursor, window, fetcher }) {
    const url = new URL(GOOGLE_EVENTS_URL);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("maxResults", "250");
    url.searchParams.set("showDeleted", "true");
    const [syncToken, syncPage] = cursor?.startsWith(CURSOR_SYNC) ? cursor.slice(CURSOR_SYNC.length).split("|") : [];
    if (syncPage) url.searchParams.set("pageToken", syncPage);
    else if (syncToken) url.searchParams.set("syncToken", syncToken);
    else {
      url.searchParams.set("timeMin", window.from.toISOString());
      url.searchParams.set("timeMax", window.to.toISOString());
      if (cursor?.startsWith(CURSOR_PAGE)) url.searchParams.set("pageToken", cursor.slice(CURSOR_PAGE.length));
    }

    const page = GooglePageSchema.parse(await getJson(url.toString(), accessToken, fetcher));
    const events: ProviderCalendarEvent[] = [];
    const removedIds: string[] = [];

    for (const raw of page.items) {
      const item = GoogleEventSchema.safeParse(raw);
      if (!item.success) continue;
      if (item.data.status === "cancelled") {
        removedIds.push(item.data.id);
        continue;
      }

      const start = googleTime(item.data.start);
      const end = googleTime(item.data.end);
      if (!start || !end) continue;

      events.push({
        providerEventId: item.data.id,
        title: item.data.summary ?? null,
        location: item.data.location ?? null,
        startsAt: start.at,
        endsAt: end.at,
        allDay: start.allDay,
        cancelled: false,
        organizerEmail: item.data.organizer?.email?.toLowerCase() ?? null,
        attendees: attendeesOf(
          (item.data.attendees ?? []).map((attendee) => ({
            email: attendee.email,
            name: attendee.displayName,
            response: attendee.responseStatus,
          })),
        ),
        webLink: item.data.htmlLink ?? null,
      });
    }

    if (page.nextPageToken) {
      const nextCursor = syncToken
        ? `${CURSOR_SYNC}${syncToken}|${page.nextPageToken}`
        : `${CURSOR_PAGE}${page.nextPageToken}`;

      return { events, removedIds, nextCursor, complete: false };
    }

    return { events, removedIds, nextCursor: `${CURSOR_SYNC}${page.nextSyncToken ?? ""}`, complete: true };
  },
};

const GraphTimeSchema = z.object({ dateTime: z.string(), timeZone: z.string().optional() }).optional();

const GraphEventSchema = z.object({
  id: z.string(),
  subject: z.string().nullable().optional(),
  isAllDay: z.boolean().optional(),
  isCancelled: z.boolean().optional(),
  webLink: z.string().nullable().optional(),
  location: z.object({ displayName: z.string().nullable().optional() }).nullable().optional(),
  start: GraphTimeSchema,
  end: GraphTimeSchema,
  organizer: z
    .object({ emailAddress: z.object({ address: z.string().nullable().optional() }).optional() })
    .nullable()
    .optional(),
  attendees: z
    .array(
      z.object({
        emailAddress: z.object({ address: z.string().nullable().optional(), name: z.string().nullable().optional() }),
        status: z.object({ response: z.string().nullable().optional() }).nullable().optional(),
      }),
    )
    .nullable()
    .optional(),
  "@removed": z.unknown().optional(),
});

const GraphPageSchema = z.object({
  value: z.array(z.unknown()).default([]),
  "@odata.nextLink": z.string().optional(),
  "@odata.deltaLink": z.string().optional(),
});

function graphTime(value: z.infer<typeof GraphTimeSchema>): Date | null {
  if (!value?.dateTime) return null;
  const iso = /[zZ]|[+-]\d{2}:\d{2}$/.test(value.dateTime) ? value.dateTime : `${value.dateTime}Z`;
  const at = new Date(iso);

  return Number.isNaN(at.getTime()) ? null : at;
}

function isGraphUrl(value: string): boolean {
  try {
    return new URL(value).origin === "https://graph.microsoft.com";
  } catch {
    return false;
  }
}

export const graphCalendarClient: CalendarProviderClient = {
  async fetchPage({ accessToken, cursor, window, fetcher }) {
    let url: string;
    if (cursor && isGraphUrl(cursor)) url = cursor;
    else {
      const initial = new URL(GRAPH_DELTA_URL);
      initial.searchParams.set("startDateTime", window.from.toISOString());
      initial.searchParams.set("endDateTime", window.to.toISOString());
      url = initial.toString();
    }

    const page = GraphPageSchema.parse(
      await getJson(url, accessToken, fetcher, { Prefer: 'outlook.timezone="UTC", odata.maxpagesize=200' }),
    );
    const events: ProviderCalendarEvent[] = [];
    const removedIds: string[] = [];

    for (const raw of page.value) {
      const item = GraphEventSchema.safeParse(raw);
      if (!item.success) continue;
      if (item.data["@removed"] !== undefined || item.data.isCancelled) {
        removedIds.push(item.data.id);
        continue;
      }

      const startsAt = graphTime(item.data.start);
      const endsAt = graphTime(item.data.end);
      if (!startsAt || !endsAt) continue;

      events.push({
        providerEventId: item.data.id,
        title: item.data.subject ?? null,
        location: item.data.location?.displayName ?? null,
        startsAt,
        endsAt,
        allDay: item.data.isAllDay ?? false,
        cancelled: false,
        organizerEmail: item.data.organizer?.emailAddress?.address?.toLowerCase() ?? null,
        attendees: attendeesOf(
          (item.data.attendees ?? []).map((attendee) => ({
            email: attendee.emailAddress.address ?? undefined,
            name: attendee.emailAddress.name ?? null,
            response: attendee.status?.response ?? null,
          })),
        ),
        webLink: item.data.webLink ?? null,
      });
    }

    const next = page["@odata.nextLink"];
    if (next && isGraphUrl(next)) return { events, removedIds, nextCursor: next, complete: false };

    const delta = page["@odata.deltaLink"];
    if (!delta || !isGraphUrl(delta)) throw new CalendarSyncError(CalendarSyncFailure.providerFailed);

    return { events, removedIds, nextCursor: delta, complete: true };
  },
};

export function calendarClientFor(provider: MailboxOAuthProvider): CalendarProviderClient {
  return provider === MailboxOAuthProvider.google ? googleCalendarClient : graphCalendarClient;
}
