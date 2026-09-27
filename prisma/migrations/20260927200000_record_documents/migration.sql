-- Documents on contacts, organizations and deals (PRD 10 W2-04): a titled contract with a
-- tracked status, stored as PDFs in the storage bucket. RecordDocumentFile holds the PDF as
-- uploaded (original) and the executed copy (signed); each exists as pending until its object
-- is verified. Parent links are SET NULL so the sweep can remove an orphan's objects before
-- its rows.

-- CreateEnum
CREATE TYPE "RecordDocumentStatus" AS ENUM ('draft', 'sent', 'completed', 'declined', 'voided');

-- CreateEnum
CREATE TYPE "RecordDocumentFileKind" AS ENUM ('original', 'signed');

-- CreateEnum
CREATE TYPE "RecordDocumentFileStatus" AS ENUM ('pending', 'ready');

-- CreateTable
CREATE TABLE "RecordDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "contactId" TEXT,
    "organizationId" TEXT,
    "dealId" TEXT,
    "title" TEXT NOT NULL,
    "status" "RecordDocumentStatus" NOT NULL DEFAULT 'draft',
    "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordDocumentFile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "kind" "RecordDocumentFileKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "status" "RecordDocumentFileStatus" NOT NULL DEFAULT 'pending',
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "RecordDocumentFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecordDocument_companyId_idx" ON "RecordDocument"("companyId");

-- CreateIndex
CREATE INDEX "RecordDocument_contactId_idx" ON "RecordDocument"("contactId");

-- CreateIndex
CREATE INDEX "RecordDocument_organizationId_idx" ON "RecordDocument"("organizationId");

-- CreateIndex
CREATE INDEX "RecordDocument_dealId_idx" ON "RecordDocument"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "RecordDocumentFile_storageKey_key" ON "RecordDocumentFile"("storageKey");

-- CreateIndex
CREATE INDEX "RecordDocumentFile_companyId_idx" ON "RecordDocumentFile"("companyId");

-- CreateIndex
CREATE INDEX "RecordDocumentFile_documentId_kind_status_idx" ON "RecordDocumentFile"("documentId", "kind", "status");

-- CreateIndex
CREATE INDEX "RecordDocumentFile_companyId_status_createdAt_idx" ON "RecordDocumentFile"("companyId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "RecordDocument" ADD CONSTRAINT "RecordDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordDocument" ADD CONSTRAINT "RecordDocument_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordDocument" ADD CONSTRAINT "RecordDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordDocument" ADD CONSTRAINT "RecordDocument_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordDocument" ADD CONSTRAINT "RecordDocument_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordDocumentFile" ADD CONSTRAINT "RecordDocumentFile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordDocumentFile" ADD CONSTRAINT "RecordDocumentFile_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "RecordDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordDocumentFile" ADD CONSTRAINT "RecordDocumentFile_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

