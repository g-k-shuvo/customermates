-- Suppression and unsubscribe (PRD 10 W3-06): addresses that must not receive marketing mail, and
-- unsubscribe tokens stored only as a sha256 hash.
-- CreateEnum
CREATE TYPE "SuppressionReason" AS ENUM ('unsubscribed', 'bounced', 'complained', 'manual');

-- CreateTable
CREATE TABLE "MessageSuppression" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "reason" "SuppressionReason" NOT NULL,
    "note" TEXT,
    "deliveryId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnsubscribeToken" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "deliveryId" TEXT,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnsubscribeToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageSuppression_companyId_idx" ON "MessageSuppression"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageSuppression_companyId_address_key" ON "MessageSuppression"("companyId", "address");

-- CreateIndex
CREATE UNIQUE INDEX "UnsubscribeToken_tokenHash_key" ON "UnsubscribeToken"("tokenHash");

-- CreateIndex
CREATE INDEX "UnsubscribeToken_companyId_idx" ON "UnsubscribeToken"("companyId");

-- AddForeignKey
ALTER TABLE "MessageSuppression" ADD CONSTRAINT "MessageSuppression_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnsubscribeToken" ADD CONSTRAINT "UnsubscribeToken_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

