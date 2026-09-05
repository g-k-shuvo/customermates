-- Lost reasons, and the closing timestamps a deal gets when it leaves the open state.
--
-- "Deal_companyId_status_idx" is dropped rather than kept. PostgreSQL can serve every
-- query that two-column index served from the new
-- "Deal_companyId_status_closedAt_idx", because ("companyId", "status") is a leading
-- prefix of ("companyId", "status", "closedAt"). Keeping both would pay a second index
-- write on every deal insert and update for no read benefit.
--
-- Plain DDL only, so this applies unchanged on PostgreSQL 16 and 17.

-- DropIndex
DROP INDEX "Deal_companyId_status_idx";

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "lostAt" TIMESTAMP(3),
ADD COLUMN     "lostNotes" TEXT,
ADD COLUMN     "lostReasonId" TEXT,
ADD COLUMN     "wonAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "LostReason" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LostReason_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LostReason_companyId_position_idx" ON "LostReason"("companyId", "position");

-- CreateIndex
CREATE INDEX "Deal_companyId_status_closedAt_idx" ON "Deal"("companyId", "status", "closedAt");

-- CreateIndex
CREATE INDEX "Deal_lostReasonId_idx" ON "Deal"("lostReasonId");

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_lostReasonId_fkey" FOREIGN KEY ("lostReasonId") REFERENCES "LostReason"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LostReason" ADD CONSTRAINT "LostReason_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
