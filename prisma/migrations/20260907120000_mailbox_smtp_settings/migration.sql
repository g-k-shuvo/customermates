-- Outbound settings for a connected mailbox.
--
-- Replying from the CRM sends as the user, through their own provider, not through the
-- instance's transactional sender. That needs SMTP coordinates alongside the IMAP ones. They are
-- nullable because a mailbox may be connected for reading only; reply is offered when they are
-- present and withheld when they are not.
--
-- No separate secret: providers that issue an app password accept the same credential on both
-- protocols, so the sealed secret in "sealedSecret" is reused rather than stored twice.

ALTER TABLE "MailboxCredential" ADD COLUMN "smtpHost" TEXT;
ALTER TABLE "MailboxCredential" ADD COLUMN "smtpPort" INTEGER;
ALTER TABLE "MailboxCredential" ADD COLUMN "smtpSecure" BOOLEAN;
