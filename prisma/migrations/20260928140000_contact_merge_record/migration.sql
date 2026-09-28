-- Contact merge records (PRD 10 W2-09): one row per merge with the JSON snapshot that undo restores.
-- Additive only.

-- CreateTable
CREATE TABLE "ContactMergeRecord" (
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

    CONSTRAINT "ContactMergeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactMergeRecord_companyId_createdAt_idx" ON "ContactMergeRecord"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "ContactMergeRecord_winnerId_idx" ON "ContactMergeRecord"("winnerId");

-- AddForeignKey
ALTER TABLE "ContactMergeRecord" ADD CONSTRAINT "ContactMergeRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactMergeRecord" ADD CONSTRAINT "ContactMergeRecord_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactMergeRecord" ADD CONSTRAINT "ContactMergeRecord_mergedByUserId_fkey" FOREIGN KEY ("mergedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactMergeRecord" ADD CONSTRAINT "ContactMergeRecord_undoneByUserId_fkey" FOREIGN KEY ("undoneByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

