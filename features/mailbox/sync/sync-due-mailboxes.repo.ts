export type DueMailbox = {
  companyId: string;
  userId: string;
  connectedAccountId: string;
};

export abstract class SyncDueMailboxesRepo {
  abstract findDueMailboxes(before: Date, limit: number): Promise<DueMailbox[]>;
}
