ALTER TYPE "EntityType" ADD VALUE IF NOT EXISTS 'lead';

ALTER TABLE "CustomFieldValue" ADD COLUMN IF NOT EXISTS "leadId" TEXT;

CREATE INDEX IF NOT EXISTS "CustomFieldValue_leadId_idx" ON "CustomFieldValue"("leadId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CustomFieldValue_leadId_fkey'
  ) THEN
    ALTER TABLE "CustomFieldValue"
      ADD CONSTRAINT "CustomFieldValue_leadId_fkey"
      FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
