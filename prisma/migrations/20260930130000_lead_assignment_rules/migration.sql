-- CreateEnum
CREATE TYPE "LeadAssignmentStrategy" AS ENUM ('specificUser', 'roundRobin');

-- CreateTable
CREATE TABLE "LeadAssignmentRule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "conditions" JSONB NOT NULL,
    "strategy" "LeadAssignmentStrategy" NOT NULL,
    "userIds" TEXT[],
    "lastAssignedUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadAssignmentRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadAssignmentRule_companyId_position_idx" ON "LeadAssignmentRule"("companyId", "position");

-- AddForeignKey
ALTER TABLE "LeadAssignmentRule" ADD CONSTRAINT "LeadAssignmentRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

