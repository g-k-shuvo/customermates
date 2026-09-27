-- Lets the owner of a saved view share it with everyone in the company. Existing views stay private.
ALTER TABLE "DataView" ADD COLUMN IF NOT EXISTS "shared" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "DataView_companyId_surfaceKey_shared_idx" ON "DataView"("companyId", "surfaceKey", "shared");
