-- A conversation may be attached to one deal, and only after a person confirms it.
--
-- Which contacts a conversation belongs to is derived at read time by joining
-- "MessagingThreadParticipant"."identifier" to "ContactIdentifier"."value", so no storage is
-- needed for that. Which deal it belongs to cannot be derived: a contact may sit on several open
-- deals, and the product refuses to guess. The offer is only made when exactly one open deal
-- matches, and this column records the answer the person gave.
--
-- Idempotent so it is safe to re-run, and written for PostgreSQL 16 as well as 17.

ALTER TABLE "MessagingThread" ADD COLUMN IF NOT EXISTS "linkedDealId" TEXT;

CREATE INDEX IF NOT EXISTS "MessagingThread_companyId_linkedDealId_idx" ON "MessagingThread"("companyId", "linkedDealId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MessagingThread_linkedDealId_fkey'
  ) THEN
    ALTER TABLE "MessagingThread"
      ADD CONSTRAINT "MessagingThread_linkedDealId_fkey"
      FOREIGN KEY ("linkedDealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
