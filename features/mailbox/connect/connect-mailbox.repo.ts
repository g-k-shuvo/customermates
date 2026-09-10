import { type MailboxCredentialDto } from "../mailbox.schema";

export type CreateMailboxArgs = {
  emailAddress: string;
  displayName: string | null;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  username: string;
  sealedSecret: string;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean | null;
  backfillFrom: Date;
  verifiedAt: Date;
};

export abstract class ConnectMailboxRepo {
  abstract createMailboxOrThrow(args: CreateMailboxArgs): Promise<MailboxCredentialDto>;
  abstract findMailboxByAddress(emailAddress: string): Promise<MailboxCredentialDto | null>;
}
