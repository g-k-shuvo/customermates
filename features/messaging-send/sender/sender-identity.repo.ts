export type SenderIdentityRow = {
  fromName: string;
  fromAddress: string;
  replyTo: string | null;
  allowUserSenders: boolean;
  verificationToken: string;
  verifiedDomain: string | null;
  verifiedAt: Date | null;
  updatedAt: Date;
};

export type SenderIdentityFields = {
  fromName: string;
  fromAddress: string;
  replyTo: string | null;
  allowUserSenders: boolean;
};

export abstract class SenderIdentityRepo {
  abstract findIdentityOrNull(): Promise<SenderIdentityRow | null>;
  abstract saveIdentity(fields: SenderIdentityFields, freshToken: string): Promise<SenderIdentityRow>;
  abstract markVerified(domain: string): Promise<SenderIdentityRow | null>;
  abstract deleteIdentity(): Promise<void>;
  abstract findUserOrNull(userId: string): Promise<{ firstName: string; lastName: string; email: string } | null>;
}
