import type { MailboxThreadDealLinkDto } from "../mailbox.schema";
import type { ContactMatch, DealCandidate, ParticipantIdentity } from "./thread-links";

import { counterpartAddresses, planThreadLinks } from "./thread-links";

export type DealName = { id: string; name: string };

export abstract class ThreadDealLinkRepo {
  abstract findContactMatches(identifiers: readonly string[]): Promise<ContactMatch[]>;
  abstract findDealCandidates(contactIds: readonly string[]): Promise<DealCandidate[]>;
  abstract findDealNames(dealIds: readonly string[]): Promise<DealName[]>;
}

export function resolveThreadDealLink(
  linkedDealId: string | null,
  participants: readonly ParticipantIdentity[],
  matches: readonly ContactMatch[],
  deals: readonly DealCandidate[],
  names: readonly DealName[],
): MailboxThreadDealLinkDto {
  const plan = planThreadLinks(participants, matches, deals);
  const nameOf = (dealId: string | null) => names.find((deal) => deal.id === dealId)?.name ?? null;
  const offeredDealId = linkedDealId === null ? plan.dealId : null;

  return {
    linkedDealId,
    linkedDealName: nameOf(linkedDealId),
    offeredDealId,
    offeredDealName: nameOf(offeredDealId),
    openDealCount: plan.dealChoices.length,
  };
}

export type ThreadLinkOffers = {
  dealLink: MailboxThreadDealLinkDto;
  matchedContactCount: number;
};

export async function loadThreadLinkOffers(
  repo: ThreadDealLinkRepo,
  linkedDealId: string | null,
  participants: readonly ParticipantIdentity[],
): Promise<ThreadLinkOffers> {
  const matches = await repo.findContactMatches(counterpartAddresses(participants));
  const deals = await repo.findDealCandidates(matches.map((match) => match.contactId));
  const plan = planThreadLinks(participants, matches, deals);
  const wanted = [linkedDealId, plan.dealId].filter((dealId): dealId is string => dealId !== null);
  const names = wanted.length > 0 ? await repo.findDealNames(wanted) : [];

  return {
    dealLink: resolveThreadDealLink(linkedDealId, participants, matches, deals, names),
    matchedContactCount: plan.contactIds.length,
  };
}

export async function loadThreadDealLink(
  repo: ThreadDealLinkRepo,
  linkedDealId: string | null,
  participants: readonly ParticipantIdentity[],
): Promise<MailboxThreadDealLinkDto> {
  return (await loadThreadLinkOffers(repo, linkedDealId, participants)).dealLink;
}
