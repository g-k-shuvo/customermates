export type CreateLeadFollowUpTaskArgs = {
  name: string;
  dueAt: Date;
  ownerUserId: string | null;
  contactId: string | null;
  organizationId: string | null;
};

export abstract class LeadFollowUpTaskRepo {
  abstract createLeadFollowUpTaskOrThrow(args: CreateLeadFollowUpTaskArgs): Promise<{ id: string }>;
}
