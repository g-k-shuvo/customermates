-- Duplicate scan (PRD 10 W2-08): match keys recomputed on every scan, the scan run, the groups it
-- found with their members, and pair dismissals that keep a rejected pair out of later scans.
-- Additive only; every table is new.

-- CreateEnum
CREATE TYPE "DuplicateScanStatus" AS ENUM ('running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "DuplicateGroupStatus" AS ENUM ('open', 'dismissed', 'merged');

-- CreateEnum
CREATE TYPE "DuplicateMatchKeyKind" AS ENUM ('emailLocalPart', 'emailDomainSurname', 'phoneLast7', 'nameKey', 'nameSoundKey', 'organizationSurname');

-- CreateTable
CREATE TABLE "DuplicateScan" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "status" "DuplicateScanStatus" NOT NULL DEFAULT 'running',
    "startedByUserId" TEXT,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "groupCount" INTEGER NOT NULL DEFAULT 0,
    "skippedBuckets" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "DuplicateScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuplicateGroup" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" "DuplicateGroupStatus" NOT NULL DEFAULT 'open',
    "score" DOUBLE PRECISION NOT NULL,
    "signals" "DuplicateMatchKeyKind"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DuplicateGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuplicateMember" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "contactId" TEXT,
    "organizationId" TEXT,

    CONSTRAINT "DuplicateMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuplicateDismissal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "leftId" TEXT NOT NULL,
    "rightId" TEXT NOT NULL,
    "dismissedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuplicateDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactMatchKey" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "contactId" TEXT,
    "organizationId" TEXT,
    "kind" "DuplicateMatchKeyKind" NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "ContactMatchKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DuplicateScan_companyId_entityType_startedAt_idx" ON "DuplicateScan"("companyId", "entityType", "startedAt");

-- CreateIndex
CREATE INDEX "DuplicateGroup_companyId_entityType_status_idx" ON "DuplicateGroup"("companyId", "entityType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DuplicateGroup_scanId_fingerprint_key" ON "DuplicateGroup"("scanId", "fingerprint");

-- CreateIndex
CREATE INDEX "DuplicateMember_companyId_idx" ON "DuplicateMember"("companyId");

-- CreateIndex
CREATE INDEX "DuplicateMember_contactId_idx" ON "DuplicateMember"("contactId");

-- CreateIndex
CREATE INDEX "DuplicateMember_organizationId_idx" ON "DuplicateMember"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "DuplicateMember_groupId_contactId_key" ON "DuplicateMember"("groupId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "DuplicateMember_groupId_organizationId_key" ON "DuplicateMember"("groupId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "DuplicateDismissal_companyId_entityType_leftId_rightId_key" ON "DuplicateDismissal"("companyId", "entityType", "leftId", "rightId");

-- CreateIndex
CREATE INDEX "ContactMatchKey_companyId_entityType_kind_value_idx" ON "ContactMatchKey"("companyId", "entityType", "kind", "value");

-- CreateIndex
CREATE INDEX "ContactMatchKey_contactId_idx" ON "ContactMatchKey"("contactId");

-- CreateIndex
CREATE INDEX "ContactMatchKey_organizationId_idx" ON "ContactMatchKey"("organizationId");

-- AddForeignKey
ALTER TABLE "DuplicateScan" ADD CONSTRAINT "DuplicateScan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateScan" ADD CONSTRAINT "DuplicateScan_startedByUserId_fkey" FOREIGN KEY ("startedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateGroup" ADD CONSTRAINT "DuplicateGroup_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateGroup" ADD CONSTRAINT "DuplicateGroup_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "DuplicateScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateMember" ADD CONSTRAINT "DuplicateMember_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateMember" ADD CONSTRAINT "DuplicateMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "DuplicateGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateMember" ADD CONSTRAINT "DuplicateMember_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateMember" ADD CONSTRAINT "DuplicateMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateDismissal" ADD CONSTRAINT "DuplicateDismissal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateDismissal" ADD CONSTRAINT "DuplicateDismissal_dismissedByUserId_fkey" FOREIGN KEY ("dismissedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactMatchKey" ADD CONSTRAINT "ContactMatchKey_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactMatchKey" ADD CONSTRAINT "ContactMatchKey_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactMatchKey" ADD CONSTRAINT "ContactMatchKey_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

