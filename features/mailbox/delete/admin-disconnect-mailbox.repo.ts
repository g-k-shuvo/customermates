import { type MailboxAccountDto } from "../mailbox.schema";

export abstract class AdminDisconnectMailboxRepo {
  abstract findConnectedMailboxCompanyWide(connectedAccountId: string): Promise<MailboxAccountDto | null>;
  abstract deleteConnectedMailboxCompanyWide(connectedAccountId: string): Promise<void>;
}
