-- Add the funnel widget kind (T6.2).
ALTER TYPE "WidgetKind" ADD VALUE IF NOT EXISTS 'funnel';

-- Pipeline a funnel widget is built over. Chart and activity widgets leave it null.
ALTER TABLE "Widget" ADD COLUMN IF NOT EXISTS "pipelineId" TEXT;
