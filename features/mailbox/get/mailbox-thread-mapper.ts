import type { MailboxMessageDto, MailboxThreadSummaryDto, MailThreadLabelDto } from "../mailbox.schema";

import type { MailAttachmentRow } from "@/features/mail-attachments/mail-attachment.schema";

import { sanitizeEmailHtml } from "../render/sanitize-email-html";

import { mailAttachmentPath, toMailAttachmentDto } from "@/features/mail-attachments/mail-attachment.schema";

export type ThreadParticipantRow = {
  identifier: string | null;
  displayName: string | null;
  isSelf: boolean;
};

export type ThreadSummaryRow = {
  id: string;
  subject: string | null;
  lastMessageAt: Date | null;
  lastMessagePreview: string | null;
  lastMessageIsSender: boolean | null;
  state: string;
  sharedToCrm: boolean;
  participants: ThreadParticipantRow[];
  archivedAt?: Date | null;
  followUpAt?: Date | null;
  labels?: { label: { id: string; name: string; color: string } }[];
};

export type ThreadMessageRow = {
  id: string;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  direction: string;
  isDraft: boolean;
  sentAt: Date;
  senderIdentifier: string | null;
  attachments: MailAttachmentRow[];
};

export function toThreadSummaryDto(row: ThreadSummaryRow): MailboxThreadSummaryDto {
  return {
    id: row.id,
    subject: row.subject,
    lastMessageAt: row.lastMessageAt,
    lastMessagePreview: row.lastMessagePreview,
    lastMessageIsSender: row.lastMessageIsSender,
    unread: row.state === "unread",
    sharedToCrm: row.sharedToCrm,
    participants: row.participants
      .filter((participant) => !participant.isSelf && participant.identifier !== null)
      .map((participant) => ({
        identifier: participant.identifier ?? "",
        displayName: participant.displayName,
      })),
    archived: Boolean(row.archivedAt),
    followUpAt: row.followUpAt ?? null,
    labels: (row.labels ?? []).map(({ label }) => label as MailThreadLabelDto),
  };
}

export function toMessageDto(row: ThreadMessageRow, allowRemoteImages: boolean): MailboxMessageDto {
  const inlineImageSources = Object.fromEntries(
    row.attachments
      .filter((attachment) => attachment.contentId !== null && attachment.storageKey !== null)
      .map((attachment) => [attachment.contentId, mailAttachmentPath(attachment.id)]),
  );
  const sanitised = sanitizeEmailHtml(row.bodyHtml, { allowRemoteImages, inlineImageSources });
  const shown = new Set(sanitised.inlineImagesShown);

  return {
    id: row.id,
    subject: row.subject,
    bodyText: row.bodyText,
    bodyHtml: sanitised.html.length > 0 ? sanitised.html : null,
    blockedImageCount: sanitised.blockedImageCount,
    outbound: row.direction === "outbound",
    isDraft: row.isDraft,
    sentAt: row.sentAt,
    senderIdentifier: row.senderIdentifier,
    attachments: row.attachments
      .filter((attachment) => !attachment.contentId || !shown.has(attachment.contentId))
      .map(toMailAttachmentDto),
  };
}
