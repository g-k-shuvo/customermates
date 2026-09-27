-- E-signature for record documents (PRD 10 W2-05): the envelope a document was sent in, its
-- provider-reported status and signers. All columns are nullable, so existing documents are
-- unchanged and stay manual until someone sends them for signature.

-- CreateEnum
CREATE TYPE "RecordDocumentSigningProvider" AS ENUM ('docusign');

-- CreateEnum
CREATE TYPE "RecordDocumentEnvelopeStatus" AS ENUM ('sent', 'delivered', 'completed', 'declined', 'voided');

-- AlterTable
ALTER TABLE "RecordDocument" ADD COLUMN     "envelopeId" TEXT,
ADD COLUMN     "envelopeRecipients" JSONB,
ADD COLUMN     "envelopeSentAt" TIMESTAMP(3),
ADD COLUMN     "envelopeStatus" "RecordDocumentEnvelopeStatus",
ADD COLUMN     "signingProvider" "RecordDocumentSigningProvider";

-- CreateIndex
CREATE UNIQUE INDEX "RecordDocument_envelopeId_key" ON "RecordDocument"("envelopeId");

