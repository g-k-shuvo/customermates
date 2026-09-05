-- Deal stage history: one row per stay of a deal in a stage, closed with a duration when
-- the deal moves on. A listener on deal.created and deal.updated writes rows from here on;
-- this migration creates the table and opens the first row for every deal that already
-- sits in a stage.
--
-- Durations that begin before this release are APPROXIMATE. The M2 pipeline backfill
-- (20260904130000_backfill_pipelines_from_custom_column) set Deal."stageEnteredAt" from
-- Deal."updatedAt" — the time of the deal's last edit of any kind, not the time it entered
-- its current stage. Every row seeded here inherits that approximation, so the first
-- duration each migrated deal reports is wrong by however long it sat in its stage before
-- that last edit. Rows opened by the listener after this release are exact. Transitions
-- that happened before this release are not recoverable, which the PRD accepts and the
-- release notes must repeat.
--
-- Every statement is guarded, so applying this file a second time is a no-op: CI applies
-- migrations and seeds twice in the same job. Plain DDL and set-based DML only, so it
-- applies unchanged on PostgreSQL 16 and 17.

-- CreateTable
CREATE TABLE IF NOT EXISTS "DealStageHistory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "fromStageId" TEXT,
    "toStageId" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exitedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "userId" TEXT,

    CONSTRAINT "DealStageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DealStageHistory_companyId_enteredAt_idx" ON "DealStageHistory"("companyId", "enteredAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DealStageHistory_dealId_enteredAt_idx" ON "DealStageHistory"("dealId", "enteredAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DealStageHistory_toStageId_idx" ON "DealStageHistory"("toStageId");

-- AddForeignKey
--
-- ADD CONSTRAINT has no IF NOT EXISTS in PostgreSQL 16 or 17, so each foreign key is added
-- only when pg_constraint does not already carry its name.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DealStageHistory_companyId_fkey') THEN
    ALTER TABLE "DealStageHistory" ADD CONSTRAINT "DealStageHistory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DealStageHistory_dealId_fkey') THEN
    ALTER TABLE "DealStageHistory" ADD CONSTRAINT "DealStageHistory_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DealStageHistory_userId_fkey') THEN
    ALTER TABLE "DealStageHistory" ADD CONSTRAINT "DealStageHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill: open one row per deal that already has a stage, entered when that deal entered
-- the stage. COALESCE covers deals whose "stageEnteredAt" was never written — created
-- before M2 and never edited since — by falling back to creation time, the earliest moment
-- the deal could have been in the stage.
--
-- The NOT EXISTS guard is deliberately unqualified by stage. Once a deal has any history
-- row the listener owns that deal, so a re-apply must not open a second row alongside one
-- the listener has since written. It also makes the whole statement set-based: the work
-- happens server-side and no deal row is loaded into application memory.
INSERT INTO "DealStageHistory" ("id", "companyId", "dealId", "fromStageId", "toStageId", "enteredAt", "exitedAt", "durationSeconds", "userId")
SELECT
  gen_random_uuid(),
  d."companyId",
  d."id",
  NULL,
  d."stageId",
  COALESCE(d."stageEnteredAt", d."createdAt"),
  NULL,
  NULL,
  NULL
FROM "Deal" d
WHERE d."stageId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "DealStageHistory" h WHERE h."dealId" = d."id");
