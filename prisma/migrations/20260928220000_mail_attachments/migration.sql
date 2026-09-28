-- Mail attachments (PRD 10 W2-13): one row per attachment of a synced message, pointing at its
-- object in storage. The message link is SET NULL so a deleted message leaves an orphan row for
-- the sweep to remove together with its object.
-- CreateTable
CREATE TABLE "MailAttachment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "messageId" TEXT,
    "storageKey" TEXT,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "contentId" TEXT,
    "inline" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MailAttachment_storageKey_key" ON "MailAttachment"("storageKey");

-- CreateIndex
CREATE INDEX "MailAttachment_companyId_idx" ON "MailAttachment"("companyId");

-- CreateIndex
CREATE INDEX "MailAttachment_messageId_idx" ON "MailAttachment"("messageId");

-- AddForeignKey
ALTER TABLE "MailAttachment" ADD CONSTRAINT "MailAttachment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailAttachment" ADD CONSTRAINT "MailAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "MessagingMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

