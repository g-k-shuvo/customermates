-- Per-folder sync progress for a connected mailbox.
--
-- "syncCursors" holds one entry per folder: its path, the UIDVALIDITY the cursor was taken
-- against, and the next UID to fetch. UIDVALIDITY is stored because a server may renumber a
-- folder at any time; when it changes the stored UID is meaningless and that folder resyncs
-- from the start rather than silently skipping mail.
--
-- "backfillFrom" bounds the initial backfill. An unbounded first sync of a decade-old mailbox
-- is how this feature would take the instance down.

ALTER TABLE "MailboxCredential" ADD COLUMN "syncCursors" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "MailboxCredential" ADD COLUMN "backfillFrom" TIMESTAMP(3);
ALTER TABLE "MailboxCredential" ADD COLUMN "lastSyncedAt" TIMESTAMP(3);
