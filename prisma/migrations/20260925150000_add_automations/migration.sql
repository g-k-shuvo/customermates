-- CreateEnum
CREATE TYPE "AutomationTriggerKind" AS ENUM ('recordCreated', 'recordUpdated', 'recordDeleted', 'schedule');

-- CreateEnum
CREATE TYPE "AutomationActionKind" AS ENUM ('updateField', 'assignOwner', 'addLabel', 'createTask', 'createNote', 'createDeal', 'createLead', 'moveStage', 'sendEmail', 'callWebhook', 'delay');

-- CreateEnum
CREATE TYPE "AutomationRunStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'skipped', 'cancelled');

-- AlterEnum
ALTER TYPE "Resource" ADD VALUE 'automations';

-- CreateTable
CREATE TABLE "Automation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "entityType" "EntityType",
    "triggerKind" "AutomationTriggerKind" NOT NULL,
    "changedFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "conditions" JSONB,
    "schedule" TEXT,
    "scheduleTimeZone" TEXT,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationStep" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "AutomationActionKind" NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRun" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "status" "AutomationRunStatus" NOT NULL DEFAULT 'queued',
    "entityType" "EntityType",
    "entityId" TEXT,
    "triggerEvent" TEXT,
    "triggerPayload" JSONB,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRunStep" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepId" TEXT,
    "position" INTEGER NOT NULL,
    "status" "AutomationRunStatus" NOT NULL DEFAULT 'queued',
    "output" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationRunStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Automation_companyId_idx" ON "Automation"("companyId");

-- CreateIndex
CREATE INDEX "Automation_companyId_enabled_triggerKind_entityType_idx" ON "Automation"("companyId", "enabled", "triggerKind", "entityType");

-- CreateIndex
CREATE INDEX "Automation_companyId_nextRunAt_idx" ON "Automation"("companyId", "nextRunAt");

-- CreateIndex
CREATE INDEX "AutomationStep_companyId_idx" ON "AutomationStep"("companyId");

-- CreateIndex
CREATE INDEX "AutomationStep_automationId_position_idx" ON "AutomationStep"("automationId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationStep_automationId_position_key" ON "AutomationStep"("automationId", "position");

-- CreateIndex
CREATE INDEX "AutomationRun_companyId_idx" ON "AutomationRun"("companyId");

-- CreateIndex
CREATE INDEX "AutomationRun_companyId_createdAt_idx" ON "AutomationRun"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "AutomationRun_automationId_createdAt_idx" ON "AutomationRun"("automationId", "createdAt");

-- CreateIndex
CREATE INDEX "AutomationRun_companyId_status_idx" ON "AutomationRun"("companyId", "status");

-- CreateIndex
CREATE INDEX "AutomationRunStep_companyId_idx" ON "AutomationRunStep"("companyId");

-- CreateIndex
CREATE INDEX "AutomationRunStep_runId_position_idx" ON "AutomationRunStep"("runId", "position");

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationStep" ADD CONSTRAINT "AutomationStep_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationStep" ADD CONSTRAINT "AutomationStep_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRunStep" ADD CONSTRAINT "AutomationRunStep_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRunStep" ADD CONSTRAINT "AutomationRunStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AutomationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRunStep" ADD CONSTRAINT "AutomationRunStep_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "AutomationStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

