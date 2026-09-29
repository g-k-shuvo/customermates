import type { DueCalendarMailbox } from "@/features/mailbox-calendar/mailbox-calendar.repo";

import { getMailboxCalendarRepo, getSyncMailboxCalendarInteractor } from "@/core/di";
import { runAsBackgroundTenant } from "@/core/decorators/background-tenant";
import { isInteractorFailure } from "@/core/validation/validation.utils";
import { CALENDAR_SYNC_PAGES } from "@/features/mailbox-calendar/mailbox-calendar.schema";

import { reportFailure, reportWarning, toWorkflowFailure } from "./capture-failure";

const WORKFLOW_NAME = "sync-calendars";
const MAILBOXES_PER_RUN = 25;
const SYNC_INTERVAL_MS = 15 * 60_000;

export type SyncCalendarsPayload = Record<string, never>;

async function listDueCalendars(): Promise<DueCalendarMailbox[]> {
  "use step";

  return await getMailboxCalendarRepo().findDueCalendarMailboxesUnscoped(
    new Date(Date.now() - SYNC_INTERVAL_MS),
    MAILBOXES_PER_RUN,
  );
}
listDueCalendars.maxRetries = 3;

async function syncCalendar(mailbox: DueCalendarMailbox): Promise<boolean> {
  "use step";

  return await runAsBackgroundTenant(mailbox.userId, async () => {
    const outcome = await getSyncMailboxCalendarInteractor().invoke({
      connectedAccountId: mailbox.connectedAccountId,
      maxPages: CALENDAR_SYNC_PAGES,
    });

    return !isInteractorFailure(outcome);
  });
}
syncCalendar.maxRetries = 2;

export async function syncCalendars(payload: SyncCalendarsPayload): Promise<void> {
  "use workflow";
  void payload;

  for (const mailbox of await listDueCalendars()) {
    try {
      if (!(await syncCalendar(mailbox))) {
        await reportWarning(WORKFLOW_NAME, `calendar of mailbox ${mailbox.connectedAccountId} did not sync this run`, {
          userId: mailbox.userId,
          companyId: mailbox.companyId,
        });
      }
    } catch (error) {
      await reportFailure(WORKFLOW_NAME, toWorkflowFailure(error), {
        userId: mailbox.userId,
        companyId: mailbox.companyId,
      });
    }
  }
}
