import { describe, expect, it, vi } from "vitest";

import type { CalendarFetch } from "../calendar-providers";

import { CalendarSyncError, googleCalendarClient, graphCalendarClient } from "../calendar-providers";

const WINDOW = { from: new Date("2026-07-01T00:00:00Z"), to: new Date("2027-10-01T00:00:00Z") };

function respond(...bodies: Array<{ status?: number; body: unknown }>) {
  const fetcher = vi.fn<CalendarFetch>();
  for (const entry of bodies)
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify(entry.body), { status: entry.status ?? 200 }));

  return fetcher;
}

function urlOf(fetcher: ReturnType<typeof respond>, call = 0): URL {
  return new URL(String(fetcher.mock.calls[call]?.[0]));
}

describe("Google Calendar client", () => {
  it("pages a first sync inside the window and ends with a sync token", async () => {
    const fetcher = respond(
      {
        body: {
          items: [
            {
              id: "e1",
              summary: "Kick-off with Acme",
              start: { dateTime: "2026-10-02T09:00:00+02:00" },
              end: { dateTime: "2026-10-02T10:00:00+02:00" },
              organizer: { email: "Max@Vendor.example" },
              attendees: [{ email: "Anna@Buyer.example", displayName: "Anna", responseStatus: "accepted" }],
              htmlLink: "https://calendar.google.com/event?eid=e1",
            },
            { id: "e2", summary: "Holiday", start: { date: "2026-10-05" }, end: { date: "2026-10-06" } },
          ],
          nextPageToken: "p2",
        },
      },
      { body: { items: [{ id: "e3", status: "cancelled" }], nextSyncToken: "s1" } },
    );

    const first = await googleCalendarClient.fetchPage({ accessToken: "t", cursor: null, window: WINDOW, fetcher });
    const second = await googleCalendarClient.fetchPage({
      accessToken: "t",
      cursor: first.nextCursor,
      window: WINDOW,
      fetcher,
    });

    expect(urlOf(fetcher).searchParams.get("timeMin")).toBe(WINDOW.from.toISOString());
    expect(urlOf(fetcher).searchParams.get("singleEvents")).toBe("true");
    expect(fetcher.mock.calls[0]?.[1].headers).toMatchObject({ Authorization: "Bearer t" });
    expect(first.complete).toBe(false);
    expect(first.events).toEqual([
      expect.objectContaining({
        providerEventId: "e1",
        startsAt: new Date("2026-10-02T07:00:00Z"),
        allDay: false,
        organizerEmail: "max@vendor.example",
        attendees: [{ email: "anna@buyer.example", name: "Anna", response: "accepted" }],
      }),
      expect.objectContaining({ providerEventId: "e2", allDay: true, startsAt: new Date("2026-10-05T00:00:00Z") }),
    ]);
    expect(urlOf(fetcher, 1).searchParams.get("pageToken")).toBe("p2");
    expect(second).toMatchObject({ removedIds: ["e3"], complete: true, nextCursor: "sync:s1" });
  });

  it("continues from the sync token, pages it, and reports an expired token", async () => {
    const fetcher = respond(
      { body: { items: [], nextPageToken: "p9" } },
      { body: { items: [], nextSyncToken: "s2" } },
      { status: 410, body: {} },
    );

    const page = await googleCalendarClient.fetchPage({ accessToken: "t", cursor: "sync:s1", window: WINDOW, fetcher });
    const last = await googleCalendarClient.fetchPage({
      accessToken: "t",
      cursor: page.nextCursor,
      window: WINDOW,
      fetcher,
    });

    expect(urlOf(fetcher).searchParams.get("syncToken")).toBe("s1");
    expect(urlOf(fetcher).searchParams.get("timeMin")).toBeNull();
    expect(page.nextCursor).toBe("sync:s1|p9");
    expect(urlOf(fetcher, 1).searchParams.get("pageToken")).toBe("p9");
    expect(last.nextCursor).toBe("sync:s2");
    await expect(
      googleCalendarClient.fetchPage({ accessToken: "t", cursor: "sync:s2", window: WINDOW, fetcher }),
    ).rejects.toThrow(new CalendarSyncError("cursorExpired"));
  });

  it("reports a missing calendar grant as access missing", async () => {
    const fetcher = respond({ status: 403, body: { error: { message: "insufficientPermissions" } } });

    await expect(
      googleCalendarClient.fetchPage({ accessToken: "t", cursor: null, window: WINDOW, fetcher }),
    ).rejects.toThrow(new CalendarSyncError("accessMissing"));
  });
});

describe("Microsoft Graph calendar client", () => {
  it("reads a delta page in UTC, drops removed events and keeps the delta link as the cursor", async () => {
    const fetcher = respond(
      {
        body: {
          value: [
            {
              id: "m1",
              subject: "Pricing call",
              start: { dateTime: "2026-10-03T13:00:00.0000000", timeZone: "UTC" },
              end: { dateTime: "2026-10-03T13:30:00.0000000", timeZone: "UTC" },
              location: { displayName: "Teams" },
              attendees: [
                { emailAddress: { address: "Ben@Buyer.example", name: "Ben" }, status: { response: "none" } },
              ],
              webLink: "https://outlook.office365.com/owa/?itemid=m1",
            },
            { id: "m2", "@removed": { reason: "deleted" } },
          ],
          "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/calendarView/delta?$skiptoken=x",
        },
      },
      {
        body: { value: [], "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/calendarView/delta?$deltatoken=d" },
      },
    );

    const first = await graphCalendarClient.fetchPage({ accessToken: "g", cursor: null, window: WINDOW, fetcher });
    const second = await graphCalendarClient.fetchPage({
      accessToken: "g",
      cursor: first.nextCursor,
      window: WINDOW,
      fetcher,
    });

    expect(urlOf(fetcher).searchParams.get("startDateTime")).toBe(WINDOW.from.toISOString());
    expect(fetcher.mock.calls[0]?.[1].headers).toMatchObject({
      Prefer: expect.stringContaining('outlook.timezone="UTC"'),
    });
    expect(first.events).toEqual([
      expect.objectContaining({
        providerEventId: "m1",
        startsAt: new Date("2026-10-03T13:00:00Z"),
        location: "Teams",
        attendees: [{ email: "ben@buyer.example", name: "Ben", response: "none" }],
      }),
    ]);
    expect(first.removedIds).toEqual(["m2"]);
    expect(String(fetcher.mock.calls[1]?.[0])).toContain("$skiptoken=x");
    expect(second).toMatchObject({ complete: true, nextCursor: expect.stringContaining("$deltatoken=d") });
  });

  it("never follows a paging link to another host", async () => {
    const fetcher = respond({ body: { value: [], "@odata.nextLink": "https://evil.example/steal" } });

    await expect(
      graphCalendarClient.fetchPage({ accessToken: "g", cursor: null, window: WINDOW, fetcher }),
    ).rejects.toThrow(new CalendarSyncError("providerFailed"));

    const guarded = respond({ body: { value: [], "@odata.deltaLink": "https://graph.microsoft.com/delta?d=1" } });
    await graphCalendarClient.fetchPage({
      accessToken: "g",
      cursor: "https://evil.example/x",
      window: WINDOW,
      fetcher: guarded,
    });
    expect(String(guarded.mock.calls[0]?.[0])).toContain("https://graph.microsoft.com/v1.0/me/calendarView/delta");
  });
});
