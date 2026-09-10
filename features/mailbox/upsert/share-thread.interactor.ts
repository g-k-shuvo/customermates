import type { Validated } from "@/core/validation/validation.utils";
import type { ThreadSummaryRow } from "../get/mailbox-thread-mapper";

import { Resource, Action } from "@/generated/prisma";

import { MailboxThreadSummaryDtoSchema, ShareThreadSchema } from "../mailbox.schema";
import { type MailboxThreadSummaryDto, type ShareThreadData } from "../mailbox.schema";
import { toThreadSummaryDto } from "../get/mailbox-thread-mapper";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Write } from "@/core/decorators/write.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { failNotFound } from "@/core/validation/interactor-failure-server";

export abstract class ShareThreadRepo {
  abstract setThreadShared(messagingThreadId: string, shared: boolean): Promise<void>;
  abstract setThreadDeal(messagingThreadId: string, dealId: string | null): Promise<void>;
  abstract findThreadWithMessages(messagingThreadId: string): Promise<ThreadSummaryRow | null>;
}

@TenantInteractor({
  resource: Resource.inboxMessages,
  action: Action.update,
})
export class ShareThreadInteractor extends AuthenticatedInteractor<ShareThreadData, MailboxThreadSummaryDto> {
  constructor(private repo: ShareThreadRepo) {
    super();
  }

  @Write({
    input: ShareThreadSchema,
    output: MailboxThreadSummaryDtoSchema,
  })
  async invoke(data: ShareThreadData): Validated<MailboxThreadSummaryDto> {
    const existing = await this.repo.findThreadWithMessages(data.threadId);
    if (!existing) return failNotFound(CustomErrorCode.mailboxThreadNotFound, ["threadId"]);

    await this.repo.setThreadShared(data.threadId, data.shared);
    if (!data.shared) await this.repo.setThreadDeal(data.threadId, null);

    return { ok: true as const, data: { ...toThreadSummaryDto(existing), sharedToCrm: data.shared } };
  }
}
