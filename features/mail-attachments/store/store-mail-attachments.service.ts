import type { StorageProvider } from "@/core/storage/storage-provider";
import type { ParsedAttachment } from "@/features/mailbox/sync/parse-source";
import type { NewMailAttachment, StoreMailAttachmentsRepo } from "../mail-attachment.repo";

import { checkUpload, UploadPolicyName } from "@/core/storage/upload-policy";
import { mintStorageKey } from "@/core/storage/storage-key";

const bytesOf = (buffer: Buffer) => new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);

export type MailAttachmentOwner = { companyId: string; connectedAccountId: string; unipileMessageId: string };

export class StoreMailAttachmentsService {
  constructor(
    private repo: StoreMailAttachmentsRepo,
    private storage: StorageProvider,
  ) {}

  async store(owner: MailAttachmentOwner, attachments: readonly ParsedAttachment[]): Promise<number> {
    if (attachments.length === 0) return 0;

    const messageId = await this.repo.findMessageIdOrNull(owner.connectedAccountId, owner.unipileMessageId);
    if (!messageId) return 0;

    const rows: NewMailAttachment[] = [];
    for (const attachment of attachments) rows.push(await this.upload(owner.companyId, messageId, attachment));

    await this.repo.createAttachments(messageId, rows);

    return rows.filter((row) => row.storageKey !== null).length;
  }

  private async upload(companyId: string, messageId: string, attachment: ParsedAttachment): Promise<NewMailAttachment> {
    const check = checkUpload({
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      byteSize: attachment.byteSize,
      maxBytes: this.storage.maxUploadBytes,
      policy: UploadPolicyName.mailAttachment,
    });
    const contentType = check.ok ? check.contentType : attachment.contentType;
    const row = {
      fileName: attachment.fileName,
      contentType,
      byteSize: attachment.byteSize,
      contentId: attachment.contentId,
      inline: attachment.inline,
    };

    if (!check.ok || !this.storage.configured) return { ...row, storageKey: null };

    const mint = (extension: string | null) =>
      mintStorageKey({ companyId, scope: "mailAttachment", recordId: messageId, extension });
    let key: string;
    try {
      key = mint(check.extension);
    } catch {
      key = mint(null);
    }

    return await this.storage.putObject({ key, body: bytesOf(attachment.content), contentType }).then(
      () => ({ ...row, storageKey: key }),
      () => ({ ...row, storageKey: null }),
    );
  }
}
