-- Organization dedupe and capture review (PRD 10 W2-10): organization match-key kinds, groups that
-- a web form or an import opens outside a scan, organization merge records, and the opt-in
-- that appends a repeat web-form submission to the contact's open lead. Additive only.

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DuplicateMatchKeyKind" ADD VALUE 'organizationNameKey';
ALTER TYPE "DuplicateMatchKeyKind" ADD VALUE 'organizationSoundKey';
ALTER TYPE "DuplicateMatchKeyKind" ADD VALUE 'organizationDomain';

-- AlterTable
ALTER TABLE "DuplicateGroup" ALTER COLUMN "scanId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "WebFormSource" ADD COLUMN     "dedupeLeads" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "OrganizationMergeRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "winnerId" TEXT,
    "loserIds" TEXT[],
    "groupId" TEXT,
    "snapshot" JSONB NOT NULL,
    "mergedByUserId" TEXT,
    "undoneByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMP(3),

    CONSTRAINT "OrganizationMergeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrganizationMergeRecord_companyId_createdAt_idx" ON "OrganizationMergeRecord"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "OrganizationMergeRecord_winnerId_idx" ON "OrganizationMergeRecord"("winnerId");

-- AddForeignKey
ALTER TABLE "OrganizationMergeRecord" ADD CONSTRAINT "OrganizationMergeRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

