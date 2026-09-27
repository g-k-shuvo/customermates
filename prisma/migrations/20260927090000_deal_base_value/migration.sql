-- A deal's own value, independent of its service lines: totalValue = baseValue + sum(service amount x quantity).
-- Defaults to 0, so every existing total is unchanged and no backfill is needed.
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "baseValue" DOUBLE PRECISION NOT NULL DEFAULT 0;
