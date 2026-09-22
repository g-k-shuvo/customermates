-- The Lead entity and the web form source it can originate from.
--
-- Both tables land together because Lead.sourceId carries a foreign key to WebFormSource.
-- Splitting them would mean either shipping the column without its constraint and
-- retrofitting it later, or ordering two migrations around a dependency that does not need
-- to exist.
--
-- Every statement is guarded so the file is safe to re-run; CI applies migrations twice.

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "LeadStatus" AS ENUM ('new', 'working', 'qualified', 'unqualified', 'converted', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "WebFormSource" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "signingSecret" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "defaultOwnerId" TEXT,
    "defaultLabels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fieldMapping" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebFormSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Lead" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'new',
    "sourceOrigin" TEXT NOT NULL DEFAULT 'manual',
    "sourceId" TEXT,
    "contactId" TEXT,
    "organizationId" TEXT,
    "ownerUserId" TEXT,
    "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "value" DOUBLE PRECISION,
    "notes" JSONB,
    "convertedDealId" TEXT,
    "convertedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WebFormSource_companyId_slug_key" ON "WebFormSource"("companyId", "slug");
CREATE INDEX IF NOT EXISTS "WebFormSource_companyId_idx" ON "WebFormSource"("companyId");
CREATE INDEX IF NOT EXISTS "Lead_companyId_idx" ON "Lead"("companyId");
CREATE INDEX IF NOT EXISTS "Lead_companyId_status_createdAt_idx" ON "Lead"("companyId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "Lead_companyId_ownerUserId_idx" ON "Lead"("companyId", "ownerUserId");
CREATE INDEX IF NOT EXISTS "Lead_contactId_idx" ON "Lead"("contactId");
CREATE INDEX IF NOT EXISTS "Lead_organizationId_idx" ON "Lead"("organizationId");
CREATE INDEX IF NOT EXISTS "Lead_sourceId_idx" ON "Lead"("sourceId");

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "WebFormSource" ADD CONSTRAINT "WebFormSource_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "Lead" ADD CONSTRAINT "Lead_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "Lead" ADD CONSTRAINT "Lead_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "WebFormSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "Lead" ADD CONSTRAINT "Lead_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "Lead" ADD CONSTRAINT "Lead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "Lead" ADD CONSTRAINT "Lead_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
