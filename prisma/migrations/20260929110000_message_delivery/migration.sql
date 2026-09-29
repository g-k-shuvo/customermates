-- Message deliveries (PRD 10 W3-03): one row per outgoing message, claimed by its dedupe key
-- before the transport is called, so a retried step or a repeated campaign batch cannot send
-- the same message twice.
-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('transactional', 'marketing');

-- CreateEnum
CREATE TYPE "MessageDeliveryStatus" AS ENUM ('sending', 'sent', 'failed', 'suppressed');

-- CreateTable
CREATE TABLE "MessageDelivery" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" "MessageKind" NOT NULL,
    "status" "MessageDeliveryStatus" NOT NULL DEFAULT 'sending',
    "source" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "automationRunStepId" TEXT,
    "campaignId" TEXT,
    "recipient" TEXT NOT NULL,
    "contactId" TEXT,
    "subject" TEXT NOT NULL,
    "transport" TEXT,
    "providerMessageId" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageDelivery_companyId_idx" ON "MessageDelivery"("companyId");

-- CreateIndex
CREATE INDEX "MessageDelivery_companyId_createdAt_idx" ON "MessageDelivery"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "MessageDelivery_providerMessageId_idx" ON "MessageDelivery"("providerMessageId");

-- CreateIndex
CREATE INDEX "MessageDelivery_automationRunStepId_idx" ON "MessageDelivery"("automationRunStepId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageDelivery_companyId_dedupeKey_key" ON "MessageDelivery"("companyId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "MessageDelivery" ADD CONSTRAINT "MessageDelivery_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

