import type { StorageProvider } from "@/core/storage/storage-provider";
import type { OutgoingAttachment } from "@/features/mailbox/outbound/build-reply";
import type { ForwardMailAttachmentsRepo } from "../mail-attachment.repo";

export const MAX_FORWARDED_ATTACHMENT_BYTES = 20 * 1024 * 1024;

async function readAll(body: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = body.getReader();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  return Buffer.concat(chunks);
}

export class ForwardMailAttachmentsService {
  constructor(
    private repo: ForwardMailAttachmentsRepo,
    private storage: StorageProvider,
  ) {}

  async load(messagingThreadId: string): Promise<OutgoingAttachment[]> {
    if (!this.storage.configured) return [];

    const stored = await this.repo.listForwardableAttachments(messagingThreadId);
    const loaded: OutgoingAttachment[] = [];
    let total = 0;

    for (const attachment of stored) {
      if (!attachment.storageKey || total + attachment.byteSize > MAX_FORWARDED_ATTACHMENT_BYTES) continue;

      const content = await this.storage.getObject(attachment.storageKey).then(
        (object) => readAll(object.body),
        () => null,
      );
      if (!content) continue;

      total += content.byteLength;
      loaded.push({ filename: attachment.fileName, contentType: attachment.contentType, content });
    }

    return loaded;
  }
}
