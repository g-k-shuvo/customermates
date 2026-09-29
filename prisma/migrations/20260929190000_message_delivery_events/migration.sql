-- CreateEnum
CREATE TYPE "MessageDeliveryEventKind" AS ENUM ('delivered', 'delayed', 'bounced', 'complained');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MessageDeliveryStatus" ADD VALUE 'delivered';
ALTER TYPE "MessageDeliveryStatus" ADD VALUE 'bounced';
ALTER TYPE "MessageDeliveryStatus" ADD VALUE 'complained';

-- CreateTable
CREATE TABLE "MessageDeliveryEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "kind" "MessageDeliveryEventKind" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "providerEventId" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageDeliveryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageDeliveryEvent_companyId_idx" ON "MessageDeliveryEvent"("companyId");

-- CreateIndex
CREATE INDEX "MessageDeliveryEvent_deliveryId_idx" ON "MessageDeliveryEvent"("deliveryId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageDeliveryEvent_deliveryId_kind_occurredAt_key" ON "MessageDeliveryEvent"("deliveryId", "kind", "occurredAt");

-- AddForeignKey
ALTER TABLE "MessageDeliveryEvent" ADD CONSTRAINT "MessageDeliveryEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageDeliveryEvent" ADD CONSTRAINT "MessageDeliveryEvent_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "MessageDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

