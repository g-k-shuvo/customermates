import { type MailboxAccount } from "../persistence/prisma-mailbox.repository";

export abstract class SyncMailboxRepo {
  abstract getMailboxAccounts(): Promise<MailboxAccount[]>;
  abstract getMailboxAccount(connectedAccountId: string): Promise<MailboxAccount | null>;
}
