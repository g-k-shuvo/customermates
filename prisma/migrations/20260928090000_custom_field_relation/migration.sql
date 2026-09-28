-- Relation custom fields (PRD 10 W2-06): a custom column of type relation links a record to one
-- contact, organization or deal. The target id is kept in "value", so filtering and sorting work as
-- for any other column, and in a typed foreign key, so deleting the target removes the link.

-- AlterEnum
ALTER TYPE "CustomColumnType" ADD VALUE 'relation';

-- AlterTable
ALTER TABLE "CustomFieldValue" ADD COLUMN     "targetContactId" TEXT,
ADD COLUMN     "targetDealId" TEXT,
ADD COLUMN     "targetOrganizationId" TEXT;

-- CreateIndex
CREATE INDEX "CustomFieldValue_targetContactId_idx" ON "CustomFieldValue"("targetContactId");

-- CreateIndex
CREATE INDEX "CustomFieldValue_targetOrganizationId_idx" ON "CustomFieldValue"("targetOrganizationId");

-- CreateIndex
CREATE INDEX "CustomFieldValue_targetDealId_idx" ON "CustomFieldValue"("targetDealId");

-- AddForeignKey
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_targetContactId_fkey" FOREIGN KEY ("targetContactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_targetOrganizationId_fkey" FOREIGN KEY ("targetOrganizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_targetDealId_fkey" FOREIGN KEY ("targetDealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

