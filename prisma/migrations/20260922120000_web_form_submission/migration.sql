-- The raw submission log behind web form capture.
--
-- rawPayload is written before any mapping runs, so a wrong field mapping can be corrected
-- and replayed rather than asking the client to resubmit a form that has already been
-- filled in once.
--
-- The unique constraint on (sourceId, externalId) is what makes delivery idempotent: the
-- sender carries its own entry id, so a retry, a double fire or a replayed backfill all
-- collide on it and create nothing new. externalId is nullable because a sender that has
-- no id of its own should still be able to deliver; PostgreSQL treats NULLs as distinct in
-- a unique index, so those rows simply do not deduplicate.
--
-- Every statement is guarded so the file is safe to re-run; CI applies migrations twice.

-- CreateTable
CREATE TABLE IF NOT EXISTS "WebFormSubmission" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT,
    "rawPayload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "error" TEXT,
    "leadId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "WebFormSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WebFormSubmission_sourceId_externalId_key" ON "WebFormSubmission"("sourceId", "externalId");
CREATE INDEX IF NOT EXISTS "WebFormSubmission_companyId_receivedAt_idx" ON "WebFormSubmission"("companyId", "receivedAt");
CREATE INDEX IF NOT EXISTS "WebFormSubmission_status_idx" ON "WebFormSubmission"("status");
CREATE INDEX IF NOT EXISTS "WebFormSubmission_leadId_idx" ON "WebFormSubmission"("leadId");

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "WebFormSubmission" ADD CONSTRAINT "WebFormSubmission_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "WebFormSubmission" ADD CONSTRAINT "WebFormSubmission_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "WebFormSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "WebFormSubmission" ADD CONSTRAINT "WebFormSubmission_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
