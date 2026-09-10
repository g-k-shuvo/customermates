import { type MailboxAccountDto } from "../mailbox.schema";

export abstract class DisconnectMailboxRepo {
  abstract findConnectedMailbox(connectedAccountId: string): Promise<MailboxAccountDto | null>;
  abstract deleteConnectedMailbox(connectedAccountId: string): Promise<void>;
}
