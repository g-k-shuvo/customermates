import type { MailboxMessageDto, MailboxThreadSummaryDto } from "../mailbox.schema";

import { sanitizeEmailHtml } from "../render/sanitize-email-html";

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
  };
}

export function toMessageDto(row: ThreadMessageRow, allowRemoteImages: boolean): MailboxMessageDto {
  const sanitised = sanitizeEmailHtml(row.bodyHtml, { allowRemoteImages });

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
  };
}
