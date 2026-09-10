import type { Validated } from "@/core/validation/validation.utils";
import type { DealName } from "../link/thread-deal-link";
import type { ContactMatch, DealCandidate } from "../link/thread-links";

import { Resource, Action } from "@/generated/prisma";

import { GetMailboxThreadSchema, MailboxThreadDtoSchema } from "../mailbox.schema";
import { type GetMailboxThreadData, type MailboxThreadDto } from "../mailbox.schema";
import { loadThreadLinkOffers } from "../link/thread-deal-link";
import { toParticipantIdentities } from "../link/thread-links";
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

export type ThreadWithMessagesRow = ThreadSummaryRow & {
  linkedDealId: string | null;
  messages: ThreadMessageRow[];
};

export abstract class GetMailboxThreadRepo {
  abstract findThreadWithMessages(messagingThreadId: string): Promise<ThreadWithMessagesRow | null>;
  abstract markThreadRead(messagingThreadId: string): Promise<void>;
  abstract findContactMatches(identifiers: readonly string[]): Promise<ContactMatch[]>;
  abstract findDealCandidates(contactIds: readonly string[]): Promise<DealCandidate[]>;
  abstract findDealNames(dealIds: readonly string[]): Promise<DealName[]>;
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

    const offers = await loadThreadLinkOffers(
      this.repo,
      thread.linkedDealId,
      toParticipantIdentities(thread.participants),
    );

    return {
      ok: true as const,
      data: {
        ...toThreadSummaryDto(thread),
        unread: false,
        messages: thread.messages.map((message) => toMessageDto(message, data.allowRemoteImages)),
        dealLink: offers.dealLink,
        matchedContactCount: offers.matchedContactCount,
      },
    };
  }
}
