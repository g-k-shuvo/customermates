export type NewMailAttachment = {
  fileName: string;
  contentType: string;
  byteSize: number;
  contentId: string | null;
  inline: boolean;
  storageKey: string | null;
};

export type StoredMailAttachment = {
  id: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  storageKey: string | null;
};

export type SweepableMailAttachment = { id: string; storageKey: string | null };

export abstract class StoreMailAttachmentsRepo {
  abstract findMessageIdOrNull(connectedAccountId: string, unipileMessageId: string): Promise<string | null>;
  abstract createAttachments(messageId: string, attachments: readonly NewMailAttachment[]): Promise<void>;
}

export abstract class GetMailAttachmentRepo {
  abstract findReadableAttachmentOrNull(id: string): Promise<StoredMailAttachment | null>;
}

export abstract class ForwardMailAttachmentsRepo {
  abstract listForwardableAttachments(messagingThreadId: string): Promise<StoredMailAttachment[]>;
}

export abstract class SweepMailAttachmentsRepo {
  abstract findOrphanedAttachmentsUnscoped(limit: number): Promise<SweepableMailAttachment[]>;
  abstract deleteAttachmentsUnscoped(ids: readonly string[]): Promise<number>;
}
