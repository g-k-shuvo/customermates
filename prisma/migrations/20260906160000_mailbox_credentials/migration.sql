-- IMAP connection settings and the sealed credential for a mailbox connected under M7.
--
-- Additive: a new table plus its foreign keys. No existing model is altered, so this stays a
-- clean rebase against upstream, which owns "ConnectedAccount".
--
-- "sealedSecret" holds the AES-256-GCM envelope produced by features/mailbox/credentials/
-- secret-box.ts, not a password. It is version-prefixed, carries its own nonce and auth tag,
-- and is opened with MAILBOX_SECRET_KEY, which is never stored in this database. A dump of
-- this table therefore yields no usable credential on its own.
--
-- One credential per connected account: "connectedAccountId" is UNIQUE rather than indexed.

CREATE TABLE "MailboxCredential" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "connectedAccountId" TEXT NOT NULL,
    "imapHost" TEXT NOT NULL,
    "imapPort" INTEGER NOT NULL,
    "imapSecure" BOOLEAN NOT NULL DEFAULT true,
    "username" TEXT NOT NULL,
    "sealedSecret" TEXT NOT NULL,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailboxCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MailboxCredential_connectedAccountId_key" ON "MailboxCredential"("connectedAccountId");

CREATE INDEX "MailboxCredential_companyId_idx" ON "MailboxCredential"("companyId");

ALTER TABLE "MailboxCredential" ADD CONSTRAINT "MailboxCredential_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MailboxCredential" ADD CONSTRAINT "MailboxCredential_connectedAccountId_fkey" FOREIGN KEY ("connectedAccountId") REFERENCES "ConnectedAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
