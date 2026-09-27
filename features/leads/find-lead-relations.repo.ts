export type LeadRelations = {
  contactId: string | null;
  organizationId: string | null;
  ownerUserId: string | null;
  sourceId: string | null;
};

export abstract class FindLeadRelationsRepo {
  abstract findRelationsByLeadIds(ids: Set<string>): Promise<Map<string, LeadRelations>>;
}
