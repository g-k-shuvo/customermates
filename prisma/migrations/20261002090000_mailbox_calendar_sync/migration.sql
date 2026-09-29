-- AlterTable
ALTER TABLE "MailboxCredential" ADD COLUMN     "calendarSyncCursor" TEXT,
ADD COLUMN     "calendarSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "calendarSyncedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MailboxCalendarEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "connectedAccountId" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "title" TEXT,
    "location" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "organizerEmail" TEXT,
    "attendees" JSONB NOT NULL DEFAULT '[]',
    "webLink" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailboxCalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailboxCalendarEventContact" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,

    CONSTRAINT "MailboxCalendarEventContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MailboxCalendarEvent_companyId_idx" ON "MailboxCalendarEvent"("companyId");

-- CreateIndex
CREATE INDEX "MailboxCalendarEvent_companyId_startsAt_idx" ON "MailboxCalendarEvent"("companyId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "MailboxCalendarEvent_connectedAccountId_providerEventId_key" ON "MailboxCalendarEvent"("connectedAccountId", "providerEventId");

-- CreateIndex
CREATE INDEX "MailboxCalendarEventContact_companyId_idx" ON "MailboxCalendarEventContact"("companyId");

-- CreateIndex
CREATE INDEX "MailboxCalendarEventContact_contactId_idx" ON "MailboxCalendarEventContact"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "MailboxCalendarEventContact_eventId_contactId_key" ON "MailboxCalendarEventContact"("eventId", "contactId");

-- AddForeignKey
ALTER TABLE "MailboxCalendarEvent" ADD CONSTRAINT "MailboxCalendarEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailboxCalendarEvent" ADD CONSTRAINT "MailboxCalendarEvent_connectedAccountId_fkey" FOREIGN KEY ("connectedAccountId") REFERENCES "ConnectedAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailboxCalendarEventContact" ADD CONSTRAINT "MailboxCalendarEventContact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailboxCalendarEventContact" ADD CONSTRAINT "MailboxCalendarEventContact_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "MailboxCalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailboxCalendarEventContact" ADD CONSTRAINT "MailboxCalendarEventContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

