import { z } from "zod";

export const MAILBOX_DEFAULT_IMAP_PORT = 993;
export const MAILBOX_MAX_BACKFILL_DAYS = 3650;
export const MAILBOX_DEFAULT_BACKFILL_DAYS = 90;

export const MailboxFolderCursorSchema = z.object({
  path: z.string().min(1),
  uidValidity: z.string().min(1),
  uidNext: z.number().int().nonnegative(),
});

export type MailboxFolderCursorDto = z.infer<typeof MailboxFolderCursorSchema>;

export const MailboxFolderCursorListSchema = z.array(MailboxFolderCursorSchema);

export const MailboxCredentialDtoSchema = z.object({
  id: z.string().uuid(),
  connectedAccountId: z.string().uuid(),
  imapHost: z.string().min(1),
  imapPort: z.number().int().min(1).max(65535),
  imapSecure: z.boolean(),
  username: z.string().min(1),
  syncCursors: MailboxFolderCursorListSchema,
  backfillFrom: z.date().nullable(),
  lastSyncedAt: z.date().nullable(),
  lastVerifiedAt: z.date().nullable(),
});

export type MailboxCredentialDto = z.infer<typeof MailboxCredentialDtoSchema>;

export const ConnectMailboxSchema = z.object({
  emailAddress: z.string().email(),
  displayName: z.string().trim().min(1).max(200).optional(),
  imapHost: z.string().trim().min(1).max(253),
  imapPort: z.number().int().min(1).max(65535).default(MAILBOX_DEFAULT_IMAP_PORT),
  imapSecure: z.boolean().default(true),
  username: z.string().trim().min(1).max(320),
  secret: z.string().min(1).max(1024),
  backfillDays: z.number().int().min(1).max(MAILBOX_MAX_BACKFILL_DAYS).default(MAILBOX_DEFAULT_BACKFILL_DAYS),
});

export type ConnectMailboxData = z.infer<typeof ConnectMailboxSchema>;

export const SyncMailboxSchema = z.object({
  connectedAccountId: z.string().uuid(),
  folderPath: z.string().min(1).optional(),
  batchSize: z.number().int().min(1).max(500).default(100),
});

export type SyncMailboxData = z.infer<typeof SyncMailboxSchema>;

export const MailboxSyncOutcomeSchema = z.object({
  connectedAccountId: z.string().uuid(),
  folderPath: z.string(),
  threadsTouched: z.number().int().nonnegative(),
  messagesStored: z.number().int().nonnegative(),
  reachedEnd: z.boolean(),
  cursor: MailboxFolderCursorSchema,
});

export type MailboxSyncOutcome = z.infer<typeof MailboxSyncOutcomeSchema>;
