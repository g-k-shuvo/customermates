import type { Validated } from "@/core/validation/validation.utils";
import type { MailboxCalendarSync } from "./mailbox-calendar-sync";
import type { MailboxCalendarRepo } from "./mailbox-calendar.repo";

import { z } from "zod";

import { Resource, Action } from "@/generated/prisma";
import { CalendarSyncFailure } from "./calendar-providers";
import {
  CALENDAR_ENABLE_PAGES,
  CONTACT_MEETINGS_LIMIT,
  CalendarMailboxDtoSchema,
  CalendarSyncOutcomeSchema,
  ContactMeetingsSchema,
  GetCalendarEventsSchema,
  MailboxCalendarEventDtoSchema,
  SetMailboxCalendarSyncSchema,
  SyncMailboxCalendarSchema,
  type CalendarMailboxDto,
  type CalendarSyncOutcome,
  type ContactMeetingsData,
  type GetCalendarEventsData,
  type MailboxCalendarEventDto,
  type SetMailboxCalendarSyncData,
  type SyncMailboxCalendarData,
} from "./mailbox-calendar.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { failConflict, failNotFound, failUnavailable } from "@/core/validation/interactor-failure-server";

const READ_OWN_MAIL = {
  permissions: [
    { resource: Resource.inboxMessages, action: Action.readAll },
    { resource: Resource.inboxMessages, action: Action.readOwn },
  ],
  condition: "OR" as const,
};

async function failureOf(failure: CalendarSyncFailure) {
  if (failure === CalendarSyncFailure.accessMissing)
    return await failConflict(CustomErrorCode.mailboxCalendarAccessMissing, ["connectedAccountId"]);

  return await failUnavailable(CustomErrorCode.mailboxCalendarSyncFailed);
}

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.create })
export class SyncMailboxCalendarInteractor extends AuthenticatedInteractor<
  SyncMailboxCalendarData,
  CalendarSyncOutcome
> {
  constructor(private sync: MailboxCalendarSync) {
    super();
  }

  @Write({ input: SyncMailboxCalendarSchema, output: CalendarSyncOutcomeSchema, tx: false })
  async invoke(data: SyncMailboxCalendarData): Validated<CalendarSyncOutcome> {
    const result = await this.sync.run(data.connectedAccountId, data.maxPages);
    if (!result) return failNotFound(CustomErrorCode.mailboxNotFound, ["connectedAccountId"]);
    if (!result.ok) return await failureOf(result.failure);

    return { ok: true as const, data: result.outcome };
  }
}

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.create })
export class SetMailboxCalendarSyncInteractor extends AuthenticatedInteractor<
  SetMailboxCalendarSyncData,
  CalendarMailboxDto
> {
  constructor(
    private repo: MailboxCalendarRepo,
    private sync: MailboxCalendarSync,
  ) {
    super();
  }

  @Write({ input: SetMailboxCalendarSyncSchema, output: CalendarMailboxDtoSchema, tx: false })
  async invoke(data: SetMailboxCalendarSyncData): Validated<CalendarMailboxDto> {
    const mailbox = await this.repo.findCalendarMailbox(data.connectedAccountId);
    if (!mailbox) return failNotFound(CustomErrorCode.mailboxNotFound, ["connectedAccountId"]);
    if (data.enabled && !mailbox.oauthProvider)
      return failConflict(CustomErrorCode.mailboxCalendarNeedsSignIn, ["connectedAccountId"]);

    if (!data.enabled) {
      await this.repo.setCalendarSync(data.connectedAccountId, false);
      await this.repo.clearCalendarEvents(data.connectedAccountId);
    } else {
      await this.repo.setCalendarSync(data.connectedAccountId, true);
      const result = await this.sync.run(data.connectedAccountId, CALENDAR_ENABLE_PAGES);
      if (result && !result.ok) {
        await this.repo.setCalendarSync(data.connectedAccountId, false);
        await this.repo.clearCalendarEvents(data.connectedAccountId);
        return await failureOf(result.failure);
      }
    }

    const updated = (await this.repo.listCalendarMailboxes()).find(
      (entry) => entry.connectedAccountId === data.connectedAccountId,
    );
    if (!updated) return failNotFound(CustomErrorCode.mailboxNotFound, ["connectedAccountId"]);

    return { ok: true as const, data: updated };
  }
}

@TenantInteractor(READ_OWN_MAIL)
export class GetCalendarMailboxesInteractor extends AuthenticatedInteractor<void, CalendarMailboxDto[]> {
  constructor(private repo: MailboxCalendarRepo) {
    super();
  }

  @ValidateOutput(CalendarMailboxDtoSchema)
  async invoke(): Validated<CalendarMailboxDto[]> {
    return { ok: true as const, data: await this.repo.listCalendarMailboxes() };
  }
}

@TenantInteractor(READ_OWN_MAIL)
export class GetMailboxCalendarEventsInteractor extends AuthenticatedInteractor<
  GetCalendarEventsData,
  MailboxCalendarEventDto[]
> {
  constructor(private repo: MailboxCalendarRepo) {
    super();
  }

  @Validate(GetCalendarEventsSchema)
  @ValidateOutput(MailboxCalendarEventDtoSchema)
  async invoke(data: GetCalendarEventsData): Validated<MailboxCalendarEventDto[]> {
    return { ok: true as const, data: await this.repo.listEvents(data.from, data.to) };
  }
}

const ContactMeetingsDtoSchema = z.object({ events: z.array(MailboxCalendarEventDtoSchema) });

@TenantInteractor(READ_OWN_MAIL)
export class GetContactMeetingsInteractor extends AuthenticatedInteractor<
  ContactMeetingsData,
  { events: MailboxCalendarEventDto[] }
> {
  constructor(private repo: MailboxCalendarRepo) {
    super();
  }

  @Validate(ContactMeetingsSchema)
  @ValidateOutput(ContactMeetingsDtoSchema)
  async invoke(data: ContactMeetingsData): Validated<{ events: MailboxCalendarEventDto[] }> {
    return {
      ok: true as const,
      data: { events: await this.repo.listContactEvents(data.contactId, CONTACT_MEETINGS_LIMIT) },
    };
  }
}
