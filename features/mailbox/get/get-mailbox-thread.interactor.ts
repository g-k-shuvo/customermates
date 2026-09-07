import type { Validated } from "@/core/validation/validation.utils";

import { Resource, Action } from "@/generated/prisma";

import { GetMailboxThreadSchema, MailboxThreadDtoSchema } from "../mailbox.schema";
import { type GetMailboxThreadData, type MailboxThreadDto } from "../mailbox.schema";
import {
  toMessageDto,
  toThreadSummaryDto,
  type ThreadMessageRow,
  type ThreadSummaryRow,
} from "./mailbox-thread-mapper";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Write } from "@/core/decorators/write.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { failNotFound } from "@/core/validation/interactor-failure-server";

export type ThreadWithMessagesRow = ThreadSummaryRow & { messages: ThreadMessageRow[] };

export abstract class GetMailboxThreadRepo {
  abstract findThreadWithMessages(messagingThreadId: string): Promise<ThreadWithMessagesRow | null>;
  abstract markThreadRead(messagingThreadId: string): Promise<void>;
}

@TenantInteractor({
  permissions: [
    { resource: Resource.inboxMessages, action: Action.readAll },
    { resource: Resource.inboxMessages, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetMailboxThreadInteractor extends AuthenticatedInteractor<GetMailboxThreadData, MailboxThreadDto> {
  constructor(private repo: GetMailboxThreadRepo) {
    super();
  }

  @Write({
    input: GetMailboxThreadSchema,
    output: MailboxThreadDtoSchema,
  })
  async invoke(data: GetMailboxThreadData): Validated<MailboxThreadDto> {
    const thread = await this.repo.findThreadWithMessages(data.threadId);
    if (!thread) return failNotFound(CustomErrorCode.mailboxThreadNotFound, ["threadId"]);

    await this.repo.markThreadRead(thread.id);

    return {
      ok: true as const,
      data: {
        ...toThreadSummaryDto(thread),
        unread: false,
        messages: thread.messages.map((message) => toMessageDto(message, data.allowRemoteImages)),
      },
    };
  }
}
