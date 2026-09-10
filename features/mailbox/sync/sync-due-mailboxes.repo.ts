export type DueMailbox = {
  companyId: string;
  userId: string;
  connectedAccountId: string;
};

export abstract class SyncDueMailboxesRepo {
  abstract findDueMailboxesUnscoped(before: Date, limit: number): Promise<DueMailbox[]>;
}
