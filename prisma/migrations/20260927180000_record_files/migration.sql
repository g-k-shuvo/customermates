-- Files attached to contacts, organizations and deals (PRD 10 W2-03). The object lives in the
-- storage bucket; this row is its catalogue entry. It exists as pending before the upload
-- and turns ready once the object is verified. Parent links are SET NULL so the sweep can
-- remove an orphan's object before it removes the row.

-- CreateEnum
CREATE TYPE "RecordFileStatus" AS ENUM ('pending', 'ready');

-- CreateTable
CREATE TABLE "RecordFile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "contactId" TEXT,
    "organizationId" TEXT,
    "dealId" TEXT,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "status" "RecordFileStatus" NOT NULL DEFAULT 'pending',
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "RecordFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecordFile_storageKey_key" ON "RecordFile"("storageKey");

-- CreateIndex
CREATE INDEX "RecordFile_companyId_idx" ON "RecordFile"("companyId");

-- CreateIndex
CREATE INDEX "RecordFile_companyId_status_createdAt_idx" ON "RecordFile"("companyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "RecordFile_contactId_idx" ON "RecordFile"("contactId");

-- CreateIndex
CREATE INDEX "RecordFile_organizationId_idx" ON "RecordFile"("organizationId");

-- CreateIndex
CREATE INDEX "RecordFile_dealId_idx" ON "RecordFile"("dealId");

-- AddForeignKey
ALTER TABLE "RecordFile" ADD CONSTRAINT "RecordFile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordFile" ADD CONSTRAINT "RecordFile_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordFile" ADD CONSTRAINT "RecordFile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordFile" ADD CONSTRAINT "RecordFile_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordFile" ADD CONSTRAINT "RecordFile_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

