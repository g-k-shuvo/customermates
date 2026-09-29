-- AlterTable
ALTER TABLE "AutomationRun" ADD COLUMN     "claimToken" TEXT,
ADD COLUMN     "dedupeKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AutomationRun_companyId_automationId_dedupeKey_key" ON "AutomationRun"("companyId", "automationId", "dedupeKey");

