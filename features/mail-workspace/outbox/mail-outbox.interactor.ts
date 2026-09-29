import type { Validated } from "@/core/validation/validation.utils";
import type { MailOutboxRepo } from "../mail-workspace.repo";

import { Resource, Action } from "@/generated/prisma";

import {
  MailOutboxMessageDtoSchema,
  OutboxMessageIdSchema,
  ScheduleMailSchema,
  type MailOutboxMessageDto,
  type OutboxMessageIdData,
  type ScheduleMailData,
} from "../mail-workspace.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { fail, failConflict, failNotFound, failUnavailable } from "@/core/validation/interactor-failure-server";

const SEND_AT_GRACE_MS = 60_000;

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.create })
export class ScheduleMailInteractor extends AuthenticatedInteractor<ScheduleMailData, MailOutboxMessageDto> {
  constructor(
    private repo: MailOutboxRepo,
    private now: () => Date,
  ) {
    super();
  }

  @Write({ input: ScheduleMailSchema, output: MailOutboxMessageDtoSchema })
  async invoke(data: ScheduleMailData): Validated<MailOutboxMessageDto> {
    const thread = await this.repo.findOwnThread(data.threadId);
    if (!thread) return failNotFound(CustomErrorCode.mailboxThreadNotFound, ["threadId"]);
    if (!thread.canSend) return failUnavailable(CustomErrorCode.mailboxSendingNotConfigured);

    const empty = data.mode === "forward" ? data.recipients.length === 0 : data.body.trim().length === 0;
    if (empty) return await fail(CustomErrorCode.mailComposeEmpty, [data.mode === "forward" ? "recipients" : "body"]);
    if (data.sendAt.getTime() < this.now().getTime() - SEND_AT_GRACE_MS)
      return await fail(CustomErrorCode.mailSendAtInPast, ["sendAt"]);

    const message = await this.repo.createOutboxMessage({
      ...data,
      recipients: data.mode === "forward" ? data.recipients : [],
    });
    await this.repo.deleteDraft(data.threadId);

    return { ok: true as const, data: message };
  }
}

@TenantInteractor({
  permissions: [
    { resource: Resource.inboxMessages, action: Action.readAll },
    { resource: Resource.inboxMessages, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetMailOutboxInteractor extends AuthenticatedInteractor<void, MailOutboxMessageDto[]> {
  constructor(private repo: MailOutboxRepo) {
    super();
  }

  @ValidateOutput(MailOutboxMessageDtoSchema)
  async invoke(): Validated<MailOutboxMessageDto[]> {
    return { ok: true as const, data: await this.repo.listOpenOutboxMessages() };
  }
}

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.create })
export class CancelOutboxMessageInteractor extends AuthenticatedInteractor<OutboxMessageIdData, MailOutboxMessageDto> {
  constructor(private repo: MailOutboxRepo) {
    super();
  }

  @Write({ input: OutboxMessageIdSchema, output: MailOutboxMessageDtoSchema })
  async invoke(data: OutboxMessageIdData): Validated<MailOutboxMessageDto> {
    const existing = await this.repo.findOwnOutboxMessage(data.id);
    if (!existing) return failNotFound(CustomErrorCode.mailOutboxNotFound, ["id"]);

    const cancelled = await this.repo.cancelOutboxMessage(data.id);
    if (!cancelled) return failConflict(CustomErrorCode.mailOutboxNotEditable, ["id"]);

    await this.repo.saveDraft({
      threadId: cancelled.threadId,
      mode: cancelled.mode,
      replyAll: cancelled.replyAll,
      body: cancelled.body,
      recipients: cancelled.recipients,
    });

    return { ok: true as const, data: cancelled };
  }
}

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.create })
export class SendOutboxMessageNowInteractor extends AuthenticatedInteractor<OutboxMessageIdData, MailOutboxMessageDto> {
  constructor(
    private repo: MailOutboxRepo,
    private now: () => Date,
  ) {
    super();
  }

  @Write({ input: OutboxMessageIdSchema, output: MailOutboxMessageDtoSchema })
  async invoke(data: OutboxMessageIdData): Validated<MailOutboxMessageDto> {
    const existing = await this.repo.findOwnOutboxMessage(data.id);
    if (!existing) return failNotFound(CustomErrorCode.mailOutboxNotFound, ["id"]);

    const rescheduled = await this.repo.rescheduleOutboxMessage(data.id, this.now());
    if (!rescheduled) return failConflict(CustomErrorCode.mailOutboxNotEditable, ["id"]);

    return { ok: true as const, data: rescheduled };
  }
}
