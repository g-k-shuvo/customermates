import { z } from "zod";

export const MAILBOX_DEFAULT_IMAP_PORT = 993;
export const MAILBOX_MAX_BACKFILL_DAYS = 3650;
export const MAILBOX_DEFAULT_BACKFILL_DAYS = 90;
export const MAILBOX_DEFAULT_SYNC_BATCH_SIZE = 100;
export const MAILBOX_MAX_THREAD_QUERY_LENGTH = 200;
export const MAILBOX_MAX_FOLDER_PATH_LENGTH = 255;
export const MAILBOX_MAX_FORWARD_RECIPIENTS = 20;

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

export const MailboxAccountDtoSchema = MailboxCredentialDtoSchema.extend({
  emailAddress: z.string().min(1),
  displayName: z.string().nullable(),
  smtpHost: z.string().nullable(),
  smtpPort: z.number().int().min(1).max(65535).nullable(),
  smtpSecure: z.boolean().nullable(),
});

export type MailboxAccountDto = z.infer<typeof MailboxAccountDtoSchema>;

export const DisconnectMailboxSchema = z.object({
  connectedAccountId: z.string().uuid(),
});

export type DisconnectMailboxData = z.infer<typeof DisconnectMailboxSchema>;

export const MailboxAccountRefSchema = z.object({
  connectedAccountId: z.string().uuid(),
});

export type MailboxAccountRefData = z.infer<typeof MailboxAccountRefSchema>;

export const ConnectMailboxSchema = z.object({
  emailAddress: z.string().email(),
  displayName: z.string().trim().min(1).max(200).optional(),
  imapHost: z.string().trim().min(1).max(253),
  imapPort: z.number().int().min(1).max(65535).default(MAILBOX_DEFAULT_IMAP_PORT),
  imapSecure: z.boolean().default(true),
  username: z.string().trim().min(1).max(320),
  secret: z.string().min(1).max(1024),
  smtpHost: z.string().trim().min(1).max(253).optional(),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  smtpSecure: z.boolean().optional(),
  backfillDays: z.number().int().min(1).max(MAILBOX_MAX_BACKFILL_DAYS).default(MAILBOX_DEFAULT_BACKFILL_DAYS),
});

export type ConnectMailboxData = z.infer<typeof ConnectMailboxSchema>;

export const SyncMailboxSchema = z.object({
  connectedAccountId: z.string().uuid(),
  folderPath: z.string().min(1).optional(),
  batchSize: z.number().int().min(1).max(500).default(MAILBOX_DEFAULT_SYNC_BATCH_SIZE),
});

export type SyncMailboxData = z.infer<typeof SyncMailboxSchema>;

export const MailboxThreadSummaryDtoSchema = z.object({
  id: z.string().uuid(),
  subject: z.string().nullable(),
  lastMessageAt: z.date().nullable(),
  lastMessagePreview: z.string().nullable(),
  lastMessageIsSender: z.boolean().nullable(),
  unread: z.boolean(),
  sharedToCrm: z.boolean(),
  participants: z.array(z.object({ identifier: z.string(), displayName: z.string().nullable() })),
});

export type MailboxThreadSummaryDto = z.infer<typeof MailboxThreadSummaryDtoSchema>;

export const MailboxMessageDtoSchema = z.object({
  id: z.string().uuid(),
  subject: z.string().nullable(),
  bodyText: z.string().nullable(),
  bodyHtml: z.string().nullable(),
  blockedImageCount: z.number().int().nonnegative(),
  outbound: z.boolean(),
  isDraft: z.boolean(),
  sentAt: z.date(),
  senderIdentifier: z.string().nullable(),
});

export type MailboxMessageDto = z.infer<typeof MailboxMessageDtoSchema>;

export const MailboxThreadDealLinkDtoSchema = z.object({
  linkedDealId: z.string().uuid().nullable(),
  linkedDealName: z.string().nullable(),
  offeredDealId: z.string().uuid().nullable(),
  offeredDealName: z.string().nullable(),
  openDealCount: z.number().int().nonnegative(),
});

export type MailboxThreadDealLinkDto = z.infer<typeof MailboxThreadDealLinkDtoSchema>;

export const MailboxThreadDtoSchema = MailboxThreadSummaryDtoSchema.extend({
  messages: z.array(MailboxMessageDtoSchema),
  dealLink: MailboxThreadDealLinkDtoSchema,
  matchedContactCount: z.number().int().nonnegative(),
});

export type MailboxThreadDto = z.infer<typeof MailboxThreadDtoSchema>;

export const LinkThreadDealSchema = z.object({
  threadId: z.string().uuid(),
  dealId: z.string().uuid().nullable(),
});

export type LinkThreadDealData = z.infer<typeof LinkThreadDealSchema>;

export const LinkThreadDealOutcomeSchema = z.object({
  threadId: z.string().uuid(),
  sharedToCrm: z.boolean(),
  dealLink: MailboxThreadDealLinkDtoSchema,
});

export type LinkThreadDealOutcome = z.infer<typeof LinkThreadDealOutcomeSchema>;

export const GetMailboxThreadsSchema = z.object({
  query: z.string().trim().max(MAILBOX_MAX_THREAD_QUERY_LENGTH).optional(),
  folder: z.string().trim().max(MAILBOX_MAX_FOLDER_PATH_LENGTH).optional(),
});

export type GetMailboxThreadsData = z.infer<typeof GetMailboxThreadsSchema>;

export const GetMailboxThreadSchema = z.object({
  threadId: z.string().uuid(),
  allowRemoteImages: z.boolean().default(false),
});

export type GetMailboxThreadData = z.infer<typeof GetMailboxThreadSchema>;

export const GetRecordThreadsSchema = z.object({
  contactId: z.string().uuid().optional(),
  dealId: z.string().uuid().optional(),
});

export type GetRecordThreadsData = z.infer<typeof GetRecordThreadsSchema>;

export const ShareThreadSchema = z.object({
  threadId: z.string().uuid(),
  shared: z.boolean(),
});

export type ShareThreadData = z.infer<typeof ShareThreadSchema>;

export const SendReplySchema = z.object({
  threadId: z.string().uuid(),
  body: z.string().trim().min(1).max(100_000),
  replyAll: z.boolean().default(false),
});

export type SendReplyData = z.infer<typeof SendReplySchema>;

export const ForwardThreadSchema = z.object({
  threadId: z.string().uuid(),
  to: z.array(z.string().trim().email()).min(1).max(MAILBOX_MAX_FORWARD_RECIPIENTS),
  body: z.string().trim().max(100_000).default(""),
});

export type ForwardThreadData = z.infer<typeof ForwardThreadSchema>;

export const SendReplyOutcomeSchema = z.object({
  threadId: z.string().uuid(),
  messageId: z.string(),
  recipients: z.array(z.string()),
});

export type SendReplyOutcome = z.infer<typeof SendReplyOutcomeSchema>;

export const MailboxSyncOutcomeSchema = z.object({
  connectedAccountId: z.string().uuid(),
  folderPath: z.string(),
  threadsTouched: z.number().int().nonnegative(),
  messagesStored: z.number().int().nonnegative(),
  reachedEnd: z.boolean(),
  cursor: MailboxFolderCursorSchema,
});

export type MailboxSyncOutcome = z.infer<typeof MailboxSyncOutcomeSchema>;
