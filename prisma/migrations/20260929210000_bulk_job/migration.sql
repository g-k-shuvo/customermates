-- CreateEnum
CREATE TYPE "BulkJobKind" AS ENUM ('contactListFill', 'campaignSend');

-- CreateEnum
CREATE TYPE "BulkJobStatus" AS ENUM ('running', 'completed', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "BulkJob" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" "BulkJobKind" NOT NULL,
    "status" "BulkJobStatus" NOT NULL DEFAULT 'running',
    "subjectId" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "cursor" TEXT,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "expectedTotal" INTEGER,
    "finalTotal" INTEGER,
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "createdById" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BulkJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BulkJob_companyId_idx" ON "BulkJob"("companyId");

-- CreateIndex
CREATE INDEX "BulkJob_companyId_kind_subjectId_idx" ON "BulkJob"("companyId", "kind", "subjectId");

-- AddForeignKey
ALTER TABLE "BulkJob" ADD CONSTRAINT "BulkJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

