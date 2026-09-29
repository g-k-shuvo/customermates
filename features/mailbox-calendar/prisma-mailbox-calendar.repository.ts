import type { Prisma } from "@/generated/prisma";
import type { ProviderCalendarEvent } from "./calendar-providers";
import type { CalendarMailbox, DueCalendarMailbox } from "./mailbox-calendar.repo";
import type { CalendarMailboxDto, MailboxCalendarEventDto } from "./mailbox-calendar.schema";

import { MailboxCalendarEventDtoSchema } from "./mailbox-calendar.schema";
import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";

const EVENT_SELECT = {
  id: true,
  connectedAccountId: true,
  title: true,
  location: true,
  startsAt: true,
  endsAt: true,
  allDay: true,
  organizerEmail: true,
  attendees: true,
  webLink: true,
} as const;

type EventRow = Prisma.MailboxCalendarEventGetPayload<{ select: typeof EVENT_SELECT }>;

function toEventDto(row: EventRow): MailboxCalendarEventDto {
  return MailboxCalendarEventDtoSchema.parse(row);
}

function eventData(event: ProviderCalendarEvent) {
  return {
    title: event.title,
    location: event.location,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    allDay: event.allDay,
    cancelled: event.cancelled,
    organizerEmail: event.organizerEmail,
    attendees: event.attendees,
    webLink: event.webLink,
  };
}

export class PrismaMailboxCalendarRepo extends BaseRepository {
  private get ownCredentialWhere() {
    return { companyId: this.companyId, connectedAccount: { userId: this.userId } };
  }

  async findCalendarMailbox(connectedAccountId: string): Promise<CalendarMailbox | null> {
    return await this.prisma.mailboxCredential.findFirst({
      where: { connectedAccountId, ...this.ownCredentialWhere },
      select: {
        connectedAccountId: true,
        oauthProvider: true,
        sealedSecret: true,
        calendarSyncEnabled: true,
        calendarSyncCursor: true,
      },
    });
  }

  async listCalendarMailboxes(): Promise<CalendarMailboxDto[]> {
    const rows = await this.prisma.mailboxCredential.findMany({
      where: this.ownCredentialWhere,
      select: {
        connectedAccountId: true,
        username: true,
        oauthProvider: true,
        calendarSyncEnabled: true,
        calendarSyncedAt: true,
        connectedAccount: { select: { emailAddress: true } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    return rows.map((row) => ({
      connectedAccountId: row.connectedAccountId,
      emailAddress: row.connectedAccount.emailAddress ?? row.username,
      oauth: row.oauthProvider !== null,
      calendarSyncEnabled: row.calendarSyncEnabled,
      calendarSyncedAt: row.calendarSyncedAt,
    }));
  }

  async setCalendarSync(connectedAccountId: string, enabled: boolean): Promise<boolean> {
    const changed = await this.prisma.mailboxCredential.updateMany({
      where: { connectedAccountId, companyId: this.companyId, connectedAccount: { userId: this.userId } },
      data: { calendarSyncEnabled: enabled, ...(enabled ? {} : { calendarSyncCursor: null, calendarSyncedAt: null }) },
    });

    return changed.count === 1;
  }

  async clearCalendarEvents(connectedAccountId: string): Promise<void> {
    await this.prisma.mailboxCalendarEvent.deleteMany({
      where: { companyId: this.companyId, connectedAccountId, connectedAccount: { userId: this.userId } },
    });
  }

  async saveCalendarCursor(connectedAccountId: string, cursor: string | null, syncedAt: Date | null): Promise<void> {
    await this.prisma.mailboxCredential.updateMany({
      where: { connectedAccountId, companyId: this.companyId, connectedAccount: { userId: this.userId } },
      data: { calendarSyncCursor: cursor, ...(syncedAt ? { calendarSyncedAt: syncedAt } : {}) },
    });
  }

  async saveSealedSecret(connectedAccountId: string, sealedSecret: string): Promise<void> {
    await this.prisma.mailboxCredential.updateMany({
      where: { connectedAccountId, companyId: this.companyId, connectedAccount: { userId: this.userId } },
      data: { sealedSecret },
    });
  }

  async storeEvents(connectedAccountId: string, events: readonly ProviderCalendarEvent[]): Promise<string[]> {
    const { companyId } = this;
    const ids: string[] = [];

    for (const event of events) {
      const existing = await this.prisma.mailboxCalendarEvent.findFirst({
        where: { companyId, connectedAccountId, providerEventId: event.providerEventId },
        select: { id: true },
      });

      if (existing) {
        await this.prisma.mailboxCalendarEvent.updateMany({
          where: { id: existing.id, companyId },
          data: eventData(event),
        });
        ids.push(existing.id);
        continue;
      }

      const created = await this.prisma.mailboxCalendarEvent.create({
        data: { companyId, connectedAccountId, providerEventId: event.providerEventId, ...eventData(event) },
        select: { id: true },
      });
      ids.push(created.id);
    }

    return ids;
  }

  async removeEvents(connectedAccountId: string, providerEventIds: readonly string[]): Promise<number> {
    if (providerEventIds.length === 0) return 0;

    const removed = await this.prisma.mailboxCalendarEvent.deleteMany({
      where: { companyId: this.companyId, connectedAccountId, providerEventId: { in: [...providerEventIds] } },
    });

    return removed.count;
  }

  async linkContacts(eventIds: readonly string[]): Promise<void> {
    if (eventIds.length === 0) return;
    const { companyId } = this;

    const events = await this.prisma.mailboxCalendarEvent.findMany({
      where: { companyId, id: { in: [...eventIds] } },
      select: { id: true, attendees: true, organizerEmail: true },
    });
    const emailsByEvent = new Map(
      events.map((event) => {
        const attendees = MailboxCalendarEventDtoSchema.shape.attendees.parse(event.attendees);
        const emails = new Set(attendees.map((attendee) => attendee.email));
        if (event.organizerEmail) emails.add(event.organizerEmail);

        return [event.id, emails] as const;
      }),
    );
    const allEmails = [...new Set([...emailsByEvent.values()].flatMap((emails) => [...emails]))];

    const identifiers =
      allEmails.length === 0
        ? []
        : await this.prisma.contactIdentifier.findMany({
            where: { companyId, channelClass: "email", value: { in: allEmails, mode: "insensitive" } },
            select: { contactId: true, value: true },
          });
    const contactsByEmail = new Map<string, Set<string>>();
    for (const identifier of identifiers) {
      const key = identifier.value.toLowerCase();
      contactsByEmail.set(key, (contactsByEmail.get(key) ?? new Set()).add(identifier.contactId));
    }

    for (const [eventId, emails] of emailsByEvent) {
      const contactIds = [...new Set([...emails].flatMap((email) => [...(contactsByEmail.get(email) ?? [])]))];

      await this.prisma.mailboxCalendarEventContact.deleteMany({
        where: { companyId, eventId, contactId: { notIn: contactIds } },
      });
      if (contactIds.length > 0) {
        await this.prisma.mailboxCalendarEventContact.createMany({
          data: contactIds.map((contactId) => ({ companyId, eventId, contactId })),
          skipDuplicates: true,
        });
      }
    }
  }

  async listEvents(from: Date, to: Date): Promise<MailboxCalendarEventDto[]> {
    const rows = await this.prisma.mailboxCalendarEvent.findMany({
      where: {
        companyId: this.companyId,
        connectedAccount: { userId: this.userId },
        cancelled: false,
        startsAt: { lt: to },
        endsAt: { gt: from },
      },
      select: EVENT_SELECT,
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      take: 500,
    });

    return rows.map(toEventDto);
  }

  async listContactEvents(contactId: string, limit: number): Promise<MailboxCalendarEventDto[]> {
    const rows = await this.prisma.mailboxCalendarEvent.findMany({
      where: {
        companyId: this.companyId,
        connectedAccount: { userId: this.userId },
        cancelled: false,
        contacts: { some: { companyId: this.companyId, contactId } },
      },
      select: EVENT_SELECT,
      orderBy: [{ startsAt: "desc" }, { id: "asc" }],
      take: limit,
    });

    return rows.map(toEventDto);
  }

  @BypassTenantGuard
  async findDueCalendarMailboxesUnscoped(before: Date, limit: number): Promise<DueCalendarMailbox[]> {
    const rows = await this.prisma.mailboxCredential.findMany({
      where: {
        calendarSyncEnabled: true,
        oauthProvider: { not: null },
        OR: [{ calendarSyncedAt: null }, { calendarSyncedAt: { lt: before } }],
      },
      select: { companyId: true, connectedAccountId: true, connectedAccount: { select: { userId: true } } },
      orderBy: [{ calendarSyncedAt: { sort: "asc", nulls: "first" } }, { connectedAccountId: "asc" }],
      take: limit,
    });

    return rows.map((row) => ({
      companyId: row.companyId,
      userId: row.connectedAccount.userId,
      connectedAccountId: row.connectedAccountId,
    }));
  }
}
