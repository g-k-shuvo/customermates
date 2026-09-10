import type { Validated } from "@/core/validation/validation.utils";
import type { DealName } from "./thread-deal-link";
import type { ContactMatch, DealCandidate } from "./thread-links";

import { Resource, Action } from "@/generated/prisma";

import { LinkThreadDealOutcomeSchema, LinkThreadDealSchema } from "../mailbox.schema";
import { type LinkThreadDealData, type LinkThreadDealOutcome } from "../mailbox.schema";
import { loadThreadDealLink } from "./thread-deal-link";
import { toParticipantIdentities } from "./thread-links";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Write } from "@/core/decorators/write.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { fail, failAuthorization, failNotFound } from "@/core/validation/interactor-failure-server";

const DEAL_READ_ACTIONS: Action[] = [Action.readAll, Action.readOwn];

export type ThreadForDealLinkRow = {
  id: string;
  sharedToCrm: boolean;
  linkedDealId: string | null;
  participants: { identifier: string | null; isSelf: boolean }[];
};

export abstract class LinkThreadDealRepo {
  abstract findThreadForDealLink(messagingThreadId: string): Promise<ThreadForDealLinkRow | null>;
  abstract setThreadDeal(messagingThreadId: string, dealId: string | null): Promise<void>;
  abstract setThreadShared(messagingThreadId: string, shared: boolean): Promise<void>;
  abstract findContactMatches(identifiers: readonly string[]): Promise<ContactMatch[]>;
  abstract findDealCandidates(contactIds: readonly string[]): Promise<DealCandidate[]>;
  abstract findDealNames(dealIds: readonly string[]): Promise<DealName[]>;
}

@TenantInteractor({
  resource: Resource.inboxMessages,
  action: Action.update,
})
export class LinkThreadDealInteractor extends AuthenticatedInteractor<LinkThreadDealData, LinkThreadDealOutcome> {
  constructor(private repo: LinkThreadDealRepo) {
    super();
  }

  @Write({
    input: LinkThreadDealSchema,
    output: LinkThreadDealOutcomeSchema,
  })
  async invoke(data: LinkThreadDealData): Validated<LinkThreadDealOutcome> {
    if (data.dealId !== null && !this.canReadDeals())
      return failAuthorization(CustomErrorCode.permissionDenied, ["dealId"]);

    const thread = await this.repo.findThreadForDealLink(data.threadId);
    if (!thread) return failNotFound(CustomErrorCode.mailboxThreadNotFound, ["threadId"]);

    const participants = toParticipantIdentities(thread.participants);
    const offer = await loadThreadDealLink(this.repo, null, participants);

    if (data.dealId !== null && data.dealId !== offer.offeredDealId)
      return await fail(CustomErrorCode.mailboxDealNotOffered, ["dealId"]);

    await this.repo.setThreadDeal(data.threadId, data.dealId);

    const sharedToCrm = thread.sharedToCrm || data.dealId !== null;
    if (sharedToCrm !== thread.sharedToCrm) await this.repo.setThreadShared(data.threadId, sharedToCrm);

    return {
      ok: true as const,
      data: {
        threadId: data.threadId,
        sharedToCrm,
        dealLink: await loadThreadDealLink(this.repo, data.dealId, participants),
      },
    };
  }

  private canReadDeals(): boolean {
    const { role } = this.user;
    if (!role) return false;
    if (role.isSystemRole) return true;

    return role.permissions.some(
      (permission) => permission.resource === Resource.deals && DEAL_READ_ACTIONS.includes(permission.action),
    );
  }
}
