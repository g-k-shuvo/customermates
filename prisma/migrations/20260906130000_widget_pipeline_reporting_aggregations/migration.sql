-- Add pipeline-stage and pipeline grouping for chart widgets.
ALTER TYPE "WidgetGroupByType" ADD VALUE IF NOT EXISTS 'dealStage';
ALTER TYPE "WidgetGroupByType" ADD VALUE IF NOT EXISTS 'dealPipeline';

-- Add the M6 reporting aggregations.
ALTER TYPE "AggregationType" ADD VALUE IF NOT EXISTS 'winRate';
ALTER TYPE "AggregationType" ADD VALUE IF NOT EXISTS 'salesCycleDays';
ALTER TYPE "AggregationType" ADD VALUE IF NOT EXISTS 'stageDurationDays';

-- Period window, in days, for the time-bounded reporting aggregations.
ALTER TABLE "Widget" ADD COLUMN IF NOT EXISTS "periodDays" INTEGER;
