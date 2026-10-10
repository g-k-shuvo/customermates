ALTER TABLE "Task" ADD COLUMN "followUpForLeadId" TEXT;

CREATE INDEX "Task_companyId_followUpForLeadId_idx" ON "Task"("companyId", "followUpForLeadId");
