-- AlterTable
ALTER TABLE "RecordFile" ADD COLUMN     "leadId" TEXT;

-- CreateIndex
CREATE INDEX "RecordFile_leadId_idx" ON "RecordFile"("leadId");

-- AddForeignKey
ALTER TABLE "RecordFile" ADD CONSTRAINT "RecordFile_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

