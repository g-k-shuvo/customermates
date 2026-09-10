-- T6.3 win-rate dimensions: owner, lost reason, the stage a deal was lost at, and calendar
-- month (closed month for closed-deal reporting, expected close month for forecasting).
--
-- PostgreSQL 12 and later allow ALTER TYPE ... ADD VALUE inside a transaction block, which is
-- what `prisma migrate deploy` opens around this file. Both PostgreSQL 16 and 17 keep that
-- behaviour, and both keep the accompanying restriction: a value added in a transaction cannot
-- be *referenced* until that transaction commits. Nothing below reads or writes these labels,
-- and the index statements do not mention the enum, so the file is valid on 16 and on 17.
-- IF NOT EXISTS makes every statement safe to re-run.
ALTER TYPE "WidgetGroupByType" ADD VALUE IF NOT EXISTS 'dealOwner';
ALTER TYPE "WidgetGroupByType" ADD VALUE IF NOT EXISTS 'dealLostReason';
ALTER TYPE "WidgetGroupByType" ADD VALUE IF NOT EXISTS 'dealStageLostAt';
ALTER TYPE "WidgetGroupByType" ADD VALUE IF NOT EXISTS 'dealCloseMonth';
ALTER TYPE "WidgetGroupByType" ADD VALUE IF NOT EXISTS 'dealExpectedCloseMonth';

-- The weighted forecast groups open deals by expected close month over a bounded forward
-- window. Without this index that scan is ("companyId") only, which degrades to a filter over
-- every deal in the company. ("companyId", "status") is a leading prefix of it, so the existing
-- ("companyId", "status", "closedAt") index still serves the closed-deal reports unchanged.
CREATE INDEX IF NOT EXISTS "Deal_companyId_status_expectedCloseDate_idx" ON "Deal"("companyId", "status", "expectedCloseDate");
