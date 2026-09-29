import type { MailboxOAuthProvider } from "@/generated/prisma";
import type { ProviderCalendarEvent } from "./calendar-providers";
import type { CalendarMailboxDto, MailboxCalendarEventDto } from "./mailbox-calendar.schema";

export type CalendarMailbox = {
  connectedAccountId: string;
  oauthProvider: MailboxOAuthProvider | null;
  sealedSecret: string;
  calendarSyncEnabled: boolean;
  calendarSyncCursor: string | null;
};

export type DueCalendarMailbox = { companyId: string; userId: string; connectedAccountId: string };

export abstract class MailboxCalendarRepo {
  abstract findCalendarMailbox(connectedAccountId: string): Promise<CalendarMailbox | null>;
  abstract listCalendarMailboxes(): Promise<CalendarMailboxDto[]>;
  abstract setCalendarSync(connectedAccountId: string, enabled: boolean): Promise<boolean>;
  abstract clearCalendarEvents(connectedAccountId: string): Promise<void>;
  abstract saveCalendarCursor(connectedAccountId: string, cursor: string | null, syncedAt: Date | null): Promise<void>;
  abstract storeEvents(connectedAccountId: string, events: readonly ProviderCalendarEvent[]): Promise<string[]>;
  abstract removeEvents(connectedAccountId: string, providerEventIds: readonly string[]): Promise<number>;
  abstract linkContacts(eventIds: readonly string[]): Promise<void>;
  abstract saveSealedSecret(connectedAccountId: string, sealedSecret: string): Promise<void>;
  abstract listEvents(from: Date, to: Date): Promise<MailboxCalendarEventDto[]>;
  abstract listContactEvents(contactId: string, limit: number): Promise<MailboxCalendarEventDto[]>;
}

export abstract class DueCalendarMailboxRepo {
  abstract findDueCalendarMailboxesUnscoped(before: Date, limit: number): Promise<DueCalendarMailbox[]>;
}
