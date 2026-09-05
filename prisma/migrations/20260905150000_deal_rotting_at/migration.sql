-- Deal rotting: a maintained deadline column rather than a predicate computed per query.
--
-- The PRD requires rotting to be SORTABLE as well as filterable. The deadline depends on
-- PipelineStage."rottingDays", a column on another table, and Prisma cannot order by a
-- cross-table expression, so a computed predicate could filter but never sort. Storing the
-- deadline on the deal gives both: a plain index range scan for the filter and a real
-- ORDER BY for the sort.
--
-- Deal."rottingAt" is the instant the deal turns rotten. It is NULL whenever the deal
-- cannot rot: the deal is closed, it sits in no stage, its stage was never entered, or its
-- stage sets no rottingDays. Application code recomputes it wherever stage placement,
-- status or the stage's rottingDays changes.
--
-- Every statement is guarded, so applying this file a second time is a no-op: CI applies
-- migrations and seeds twice in the same job. Plain DDL and set-based DML only, so it
-- applies unchanged on PostgreSQL 16 and 17.

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "rottingAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Deal_companyId_status_rottingAt_idx" ON "Deal"("companyId", "status", "rottingAt");

-- Backfill: stamp the deadline for every open deal whose stage already carries a rotting
-- window. Closed deals, stageless deals, deals that never recorded a stage entry and stages
-- with no rottingDays are all left NULL, which is exactly what the application computes for
-- them.
--
-- The stage is joined on BOTH id and companyId so the window can only ever come from the
-- deal's own tenant, and on no particular pipeline: scoping the lookup to the default
-- pipeline would leave every deal on a secondary pipeline unable to rot.
--
-- IDEMPOTENCY. The final predicate compares the stored value with the value this statement
-- would write, so a second run matches no rows. It also means a deadline an earlier run
-- wrote and the application has since recomputed is only rewritten when it actually differs.
UPDATE "Deal" d
SET "rottingAt" = d."stageEnteredAt" + make_interval(days => s."rottingDays")
FROM "PipelineStage" s
WHERE s."id" = d."stageId"
  AND s."companyId" = d."companyId"
  AND d."status" = 'open'
  AND d."stageEnteredAt" IS NOT NULL
  AND s."rottingDays" IS NOT NULL
  AND s."rottingDays" > 0
  AND d."rottingAt" IS DISTINCT FROM d."stageEnteredAt" + make_interval(days => s."rottingDays");
