import type { MailboxCredentialAuth } from "@/features/mailbox/oauth/mailbox-credential-auth";
import type { CalendarFetch } from "./calendar-providers";
import type { MailboxCalendarRepo } from "./mailbox-calendar.repo";
import type { CalendarSyncOutcome } from "./mailbox-calendar.schema";

import { MailboxTransportError } from "@/features/mailbox/sync/mailbox-transport";

import { calendarClientFor, CalendarSyncError, CalendarSyncFailure } from "./calendar-providers";
import { CALENDAR_FUTURE_DAYS, CALENDAR_PAST_DAYS } from "./mailbox-calendar.schema";

const DAY_MS = 86_400_000;

type SyncResult = { ok: true; outcome: CalendarSyncOutcome } | { ok: false; failure: CalendarSyncFailure };

export class MailboxCalendarSync {
  constructor(
    private repo: MailboxCalendarRepo,
    private auth: MailboxCredentialAuth | null,
    private fetcher: CalendarFetch,
    private now: () => Date,
  ) {}

  async run(connectedAccountId: string, maxPages: number): Promise<SyncResult | null> {
    const mailbox = await this.repo.findCalendarMailbox(connectedAccountId);
    if (!mailbox) return null;
    if (!mailbox.oauthProvider || !this.auth) return { ok: false, failure: CalendarSyncFailure.accessMissing };

    let accessToken: string | null;
    try {
      accessToken = await this.auth.resolveCalendarToken(mailbox);
    } catch (error) {
      if (error instanceof MailboxTransportError) return { ok: false, failure: CalendarSyncFailure.accessMissing };
      throw error;
    }
    if (!accessToken) return { ok: false, failure: CalendarSyncFailure.accessMissing };

    const client = calendarClientFor(mailbox.oauthProvider);
    const now = this.now();
    const window = {
      from: new Date(now.getTime() - CALENDAR_PAST_DAYS * DAY_MS),
      to: new Date(now.getTime() + CALENDAR_FUTURE_DAYS * DAY_MS),
    };
    let cursor = mailbox.calendarSyncCursor;
    let restarted = false;
    let stored = 0;
    let removed = 0;
    let complete = false;

    for (let page = 0; page < maxPages && !complete; page += 1) {
      let result;
      try {
        result = await client.fetchPage({ accessToken, cursor, window, fetcher: this.fetcher });
      } catch (error) {
        if (error instanceof CalendarSyncError && error.failure === CalendarSyncFailure.cursorExpired && !restarted) {
          restarted = true;
          cursor = null;
          page -= 1;
          continue;
        }
        if (error instanceof CalendarSyncError) return { ok: false, failure: error.failure };
        throw error;
      }

      const ids = await this.repo.storeEvents(connectedAccountId, result.events);
      await this.repo.linkContacts(ids);
      removed += await this.repo.removeEvents(connectedAccountId, result.removedIds);
      stored += ids.length;
      cursor = result.nextCursor;
      complete = result.complete;
      await this.repo.saveCalendarCursor(connectedAccountId, cursor, complete ? this.now() : null);
    }

    return { ok: true, outcome: { connectedAccountId, stored, removed, complete } };
  }
}
