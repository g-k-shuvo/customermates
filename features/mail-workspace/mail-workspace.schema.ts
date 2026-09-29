import { z } from "zod";

import { MailComposeMode, MailOutboxStatus } from "@/generated/prisma";
import { MAIL_LABEL_COLORS } from "@/features/mailbox/mailbox.schema";

export const MAIL_DRAFT_MAX_BODY = 100_000;
export const MAIL_MAX_RECIPIENTS = 50;
export const MAIL_OUTBOX_MAX_ATTEMPTS = 3;
export const MAIL_OUTBOX_RETRY_DELAY_MS = 5 * 60_000;
export const MAIL_OUTBOX_BATCH = 25;
export const MAIL_OUTBOX_STALE_CLAIM_MS = 10 * 60_000;
export const MAIL_LABEL_MAX_NAME = 40;

const RecipientsSchema = z.array(z.string().trim().email()).max(MAIL_MAX_RECIPIENTS);

export const ThreadIdSchema = z.object({ threadId: z.uuid() });

export type ThreadIdData = z.infer<typeof ThreadIdSchema>;

export const MailComposeSchema = z.object({
  threadId: z.uuid(),
  mode: z.enum(MailComposeMode).default(MailComposeMode.reply),
  replyAll: z.boolean().default(false),
  body: z.string().max(MAIL_DRAFT_MAX_BODY).default(""),
  recipients: RecipientsSchema.default([]),
});

export type MailComposeData = z.infer<typeof MailComposeSchema>;

export const MailDraftDtoSchema = z.object({
  threadId: z.uuid(),
  mode: z.enum(MailComposeMode),
  replyAll: z.boolean(),
  body: z.string(),
  recipients: z.array(z.string()),
  updatedAt: z.date(),
});

export type MailDraftDto = z.infer<typeof MailDraftDtoSchema>;

export const ScheduleMailSchema = MailComposeSchema.extend({
  sendAt: z.coerce.date(),
});

export type ScheduleMailData = z.infer<typeof ScheduleMailSchema>;

export const MailOutboxMessageDtoSchema = z.object({
  id: z.uuid(),
  threadId: z.uuid(),
  threadSubject: z.string().nullable(),
  mode: z.enum(MailComposeMode),
  replyAll: z.boolean(),
  body: z.string(),
  recipients: z.array(z.string()),
  status: z.enum(MailOutboxStatus),
  sendAt: z.date(),
  attempts: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  sentAt: z.date().nullable(),
});

export type MailOutboxMessageDto = z.infer<typeof MailOutboxMessageDtoSchema>;

export const OutboxMessageIdSchema = z.object({ id: z.uuid() });

export type OutboxMessageIdData = z.infer<typeof OutboxMessageIdSchema>;

export const SetThreadArchivedSchema = z.object({ threadId: z.uuid(), archived: z.boolean() });

export type SetThreadArchivedData = z.infer<typeof SetThreadArchivedSchema>;

export const SetThreadFollowUpSchema = z.object({ threadId: z.uuid(), followUpAt: z.coerce.date().nullable() });

export type SetThreadFollowUpData = z.infer<typeof SetThreadFollowUpSchema>;

export const ThreadStateDtoSchema = z.object({
  threadId: z.uuid(),
  archived: z.boolean(),
  followUpAt: z.date().nullable(),
});

export type ThreadStateDto = z.infer<typeof ThreadStateDtoSchema>;

export const UpsertMailLabelSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(MAIL_LABEL_MAX_NAME),
  color: z.enum(MAIL_LABEL_COLORS).default("secondary"),
});

export type UpsertMailLabelData = z.infer<typeof UpsertMailLabelSchema>;

export const MailLabelIdSchema = z.object({ id: z.uuid() });

export type MailLabelIdData = z.infer<typeof MailLabelIdSchema>;

export const SetThreadLabelsSchema = z.object({
  threadId: z.uuid(),
  labelIds: z.array(z.uuid()).max(20),
});

export type SetThreadLabelsData = z.infer<typeof SetThreadLabelsSchema>;

export const SendDueOutboxResultSchema = z.object({
  sent: z.number().int().nonnegative(),
  retried: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});

export type SendDueOutboxResult = z.infer<typeof SendDueOutboxResultSchema>;
