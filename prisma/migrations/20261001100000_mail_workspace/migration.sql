-- CreateEnum
CREATE TYPE "MailComposeMode" AS ENUM ('reply', 'forward');

-- CreateEnum
CREATE TYPE "MailOutboxStatus" AS ENUM ('scheduled', 'sending', 'sent', 'failed', 'cancelled');

-- AlterTable
ALTER TABLE "MessagingThread" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "followUpAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MailDraft" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messagingThreadId" TEXT NOT NULL,
    "mode" "MailComposeMode" NOT NULL DEFAULT 'reply',
    "replyAll" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL DEFAULT '',
    "recipients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailOutboxMessage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messagingThreadId" TEXT NOT NULL,
    "mode" "MailComposeMode" NOT NULL DEFAULT 'reply',
    "replyAll" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "recipients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "MailOutboxStatus" NOT NULL DEFAULT 'scheduled',
    "sendAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "claimedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailOutboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailLabel" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'secondary',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessagingThreadLabel" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "messagingThreadId" TEXT NOT NULL,
    "mailLabelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessagingThreadLabel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MailDraft_companyId_idx" ON "MailDraft"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "MailDraft_userId_messagingThreadId_key" ON "MailDraft"("userId", "messagingThreadId");

-- CreateIndex
CREATE INDEX "MailOutboxMessage_companyId_idx" ON "MailOutboxMessage"("companyId");

-- CreateIndex
CREATE INDEX "MailOutboxMessage_status_sendAt_idx" ON "MailOutboxMessage"("status", "sendAt");

-- CreateIndex
CREATE INDEX "MailOutboxMessage_companyId_userId_status_idx" ON "MailOutboxMessage"("companyId", "userId", "status");

-- CreateIndex
CREATE INDEX "MailLabel_companyId_idx" ON "MailLabel"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "MailLabel_companyId_name_key" ON "MailLabel"("companyId", "name");

-- CreateIndex
CREATE INDEX "MessagingThreadLabel_companyId_idx" ON "MessagingThreadLabel"("companyId");

-- CreateIndex
CREATE INDEX "MessagingThreadLabel_mailLabelId_idx" ON "MessagingThreadLabel"("mailLabelId");

-- CreateIndex
CREATE UNIQUE INDEX "MessagingThreadLabel_messagingThreadId_mailLabelId_key" ON "MessagingThreadLabel"("messagingThreadId", "mailLabelId");

-- AddForeignKey
ALTER TABLE "MailDraft" ADD CONSTRAINT "MailDraft_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailDraft" ADD CONSTRAINT "MailDraft_messagingThreadId_fkey" FOREIGN KEY ("messagingThreadId") REFERENCES "MessagingThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailOutboxMessage" ADD CONSTRAINT "MailOutboxMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailOutboxMessage" ADD CONSTRAINT "MailOutboxMessage_messagingThreadId_fkey" FOREIGN KEY ("messagingThreadId") REFERENCES "MessagingThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailLabel" ADD CONSTRAINT "MailLabel_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingThreadLabel" ADD CONSTRAINT "MessagingThreadLabel_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingThreadLabel" ADD CONSTRAINT "MessagingThreadLabel_messagingThreadId_fkey" FOREIGN KEY ("messagingThreadId") REFERENCES "MessagingThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingThreadLabel" ADD CONSTRAINT "MessagingThreadLabel_mailLabelId_fkey" FOREIGN KEY ("mailLabelId") REFERENCES "MailLabel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

