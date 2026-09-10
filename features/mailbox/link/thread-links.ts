export type ParticipantIdentity = {
  identifier: string;
  isSelf: boolean;
};

export type ContactMatch = {
  identifier: string;
  contactId: string;
};

export type DealCandidate = {
  dealId: string;
  contactId: string;
  isOpen: boolean;
};

export type ThreadLinkPlan = {
  contactIds: string[];
  dealId: string | null;
  dealChoices: string[];
};

export function toParticipantIdentities(
  rows: readonly { identifier: string | null; isSelf: boolean }[],
): ParticipantIdentity[] {
  return rows.flatMap((row) => (row.identifier === null ? [] : [{ identifier: row.identifier, isSelf: row.isSelf }]));
}

export function counterpartAddresses(participants: readonly ParticipantIdentity[]): string[] {
  return [...counterpartIdentifiers(participants)];
}

function counterpartIdentifiers(participants: readonly ParticipantIdentity[]): Set<string> {
  const found = new Set<string>();

  for (const participant of participants) {
    if (participant.isSelf) continue;

    const identifier = participant.identifier.trim().toLowerCase();
    if (identifier.length > 0) found.add(identifier);
  }

  return found;
}

export function planThreadLinks(
  participants: readonly ParticipantIdentity[],
  matches: readonly ContactMatch[],
  deals: readonly DealCandidate[],
): ThreadLinkPlan {
  const counterparts = counterpartIdentifiers(participants);
  const contactIds = new Set<string>();

  for (const match of matches)
    if (counterparts.has(match.identifier.trim().toLowerCase())) contactIds.add(match.contactId);

  const openDeals = new Set<string>();
  for (const deal of deals) if (deal.isOpen && contactIds.has(deal.contactId)) openDeals.add(deal.dealId);

  const dealChoices = [...openDeals].sort();

  return {
    contactIds: [...contactIds].sort(),
    dealId: dealChoices.length === 1 ? dealChoices[0] : null,
    dealChoices,
  };
}
