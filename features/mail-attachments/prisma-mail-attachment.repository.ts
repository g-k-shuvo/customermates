import type { Prisma } from "@/generated/prisma";
import type {
  ForwardMailAttachmentsRepo,
  GetMailAttachmentRepo,
  NewMailAttachment,
  StoreMailAttachmentsRepo,
  StoredMailAttachment,
  SweepableMailAttachment,
  SweepMailAttachmentsRepo,
} from "./mail-attachment.repo";

import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";

const STORED_SELECT = {
  id: true,
  fileName: true,
  contentType: true,
  byteSize: true,
  storageKey: true,
} satisfies Prisma.MailAttachmentSelect;

export class PrismaMailAttachmentRepo
  extends BaseRepository
  implements StoreMailAttachmentsRepo, GetMailAttachmentRepo, ForwardMailAttachmentsRepo, SweepMailAttachmentsRepo
{
  private get readableThread(): Prisma.MessagingThreadWhereInput {
    return {
      companyId: this.companyId,
      provider: "mail",
      OR: [{ connectedAccount: { userId: this.userId } }, { sharedToCrm: true }],
    };
  }

  async findMessageIdOrNull(connectedAccountId: string, unipileMessageId: string): Promise<string | null> {
    const message = await this.prisma.messagingMessage.findFirst({
      where: { companyId: this.companyId, connectedAccountId, unipileMessageId },
      select: { id: true },
    });

    return message?.id ?? null;
  }

  async createAttachments(messageId: string, attachments: readonly NewMailAttachment[]): Promise<void> {
    if (attachments.length === 0) return;

    await this.prisma.mailAttachment.createMany({
      data: attachments.map((attachment) => ({ companyId: this.companyId, messageId, ...attachment })),
    });
  }

  async findReadableAttachmentOrNull(id: string): Promise<StoredMailAttachment | null> {
    return await this.prisma.mailAttachment.findFirst({
      where: { id, companyId: this.companyId, message: { thread: this.readableThread } },
      select: STORED_SELECT,
    });
  }

  async listForwardableAttachments(messagingThreadId: string): Promise<StoredMailAttachment[]> {
    const latest = await this.prisma.messagingMessage.findFirst({
      where: {
        companyId: this.companyId,
        messagingThreadId,
        thread: { ...this.readableThread, connectedAccount: { userId: this.userId } },
      },
      orderBy: [{ sentAt: "desc" }, { id: "desc" }],
      select: { attachments: { where: { inline: false, storageKey: { not: null } }, select: STORED_SELECT } },
    });

    return latest?.attachments ?? [];
  }

  @BypassTenantGuard
  async findOrphanedAttachmentsUnscoped(limit: number): Promise<SweepableMailAttachment[]> {
    return await this.prisma.mailAttachment.findMany({
      where: { messageId: null },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: { id: true, storageKey: true },
    });
  }

  @BypassTenantGuard
  async deleteAttachmentsUnscoped(ids: readonly string[]): Promise<number> {
    if (ids.length === 0) return 0;

    const deleted = await this.prisma.mailAttachment.deleteMany({ where: { id: { in: [...ids] }, messageId: null } });

    return deleted.count;
  }
}
