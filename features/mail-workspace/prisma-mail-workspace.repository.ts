import type {
  MailComposeData,
  MailDraftDto,
  MailOutboxMessageDto,
  ThreadStateDto,
  UpsertMailLabelData,
} from "./mail-workspace.schema";
import type { DueOutboxMessage, OwnThread } from "./mail-workspace.repo";
import type { MailThreadLabelDto } from "@/features/mailbox/mailbox.schema";

import { MailThreadLabelDtoSchema } from "@/features/mailbox/mailbox.schema";
import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";

const OPEN_OUTBOX_STATUSES = ["scheduled", "sending", "failed"] as const;

const DRAFT_SELECT = {
  messagingThreadId: true,
  mode: true,
  replyAll: true,
  body: true,
  recipients: true,
  updatedAt: true,
} as const;

const OUTBOX_SELECT = {
  id: true,
  messagingThreadId: true,
  mode: true,
  replyAll: true,
  body: true,
  recipients: true,
  status: true,
  sendAt: true,
  attempts: true,
  lastError: true,
  sentAt: true,
  thread: { select: { subject: true } },
} as const;

const LABEL_SELECT = { id: true, name: true, color: true } as const;

type DraftRow = {
  messagingThreadId: string;
  mode: MailDraftDto["mode"];
  replyAll: boolean;
  body: string;
  recipients: string[];
  updatedAt: Date;
};

type OutboxRow = Omit<MailOutboxMessageDto, "threadId" | "threadSubject"> & {
  messagingThreadId: string;
  thread: { subject: string | null };
};

function toDraftDto(row: DraftRow): MailDraftDto {
  const { messagingThreadId, ...rest } = row;

  return { threadId: messagingThreadId, ...rest };
}

function toOutboxDto(row: OutboxRow): MailOutboxMessageDto {
  const { messagingThreadId, thread, ...rest } = row;

  return { threadId: messagingThreadId, threadSubject: thread.subject, ...rest };
}

function toLabelDto(row: { id: string; name: string; color: string }): MailThreadLabelDto {
  return MailThreadLabelDtoSchema.parse(row);
}

export class PrismaMailWorkspaceRepo extends BaseRepository {
  private get ownThreadWhere() {
    return { companyId: this.companyId, provider: "mail" as const, connectedAccount: { userId: this.userId } };
  }

  async findOwnThread(threadId: string): Promise<OwnThread | null> {
    const thread = await this.prisma.messagingThread.findFirst({
      where: { id: threadId, ...this.ownThreadWhere },
      select: {
        id: true,
        subject: true,
        connectedAccount: { select: { mailboxCredential: { select: { smtpHost: true, smtpPort: true } } } },
      },
    });
    if (!thread) return null;

    const credential = thread.connectedAccount.mailboxCredential;

    return { id: thread.id, subject: thread.subject, canSend: Boolean(credential?.smtpHost && credential.smtpPort) };
  }

  async getDraft(threadId: string): Promise<MailDraftDto | null> {
    const row = await this.prisma.mailDraft.findFirst({
      where: { companyId: this.companyId, userId: this.userId, messagingThreadId: threadId },
      select: DRAFT_SELECT,
    });

    return row ? toDraftDto(row) : null;
  }

  @Transaction
  async saveDraft(data: MailComposeData): Promise<MailDraftDto> {
    const values = { mode: data.mode, replyAll: data.replyAll, body: data.body, recipients: data.recipients };
    const where = { companyId: this.companyId, userId: this.userId, messagingThreadId: data.threadId };

    const updated = await this.prisma.mailDraft.updateMany({
      where: { companyId: this.companyId, userId: this.userId, messagingThreadId: data.threadId },
      data: values,
    });
    if (updated.count === 0)
      return toDraftDto(await this.prisma.mailDraft.create({ data: { ...where, ...values }, select: DRAFT_SELECT }));

    const row = await this.prisma.mailDraft.findFirst({ where, select: DRAFT_SELECT });

    return toDraftDto(row ?? { messagingThreadId: data.threadId, ...values, updatedAt: new Date() });
  }

  async deleteDraft(threadId: string): Promise<void> {
    await this.prisma.mailDraft.deleteMany({
      where: { companyId: this.companyId, userId: this.userId, messagingThreadId: threadId },
    });
  }

  async createOutboxMessage(data: MailComposeData & { sendAt: Date }): Promise<MailOutboxMessageDto> {
    const row = await this.prisma.mailOutboxMessage.create({
      data: {
        companyId: this.companyId,
        userId: this.userId,
        messagingThreadId: data.threadId,
        mode: data.mode,
        replyAll: data.replyAll,
        body: data.body,
        recipients: data.recipients,
        sendAt: data.sendAt,
      },
      select: OUTBOX_SELECT,
    });

    return toOutboxDto(row);
  }

  async listOpenOutboxMessages(): Promise<MailOutboxMessageDto[]> {
    const rows = await this.prisma.mailOutboxMessage.findMany({
      where: { companyId: this.companyId, userId: this.userId, status: { in: [...OPEN_OUTBOX_STATUSES] } },
      select: OUTBOX_SELECT,
      orderBy: [{ sendAt: "asc" }, { id: "asc" }],
      take: 200,
    });

    return rows.map(toOutboxDto);
  }

  async findOwnOutboxMessage(id: string): Promise<MailOutboxMessageDto | null> {
    const row = await this.prisma.mailOutboxMessage.findFirst({
      where: { id, companyId: this.companyId, userId: this.userId },
      select: OUTBOX_SELECT,
    });

    return row ? toOutboxDto(row) : null;
  }

  async cancelOutboxMessage(id: string): Promise<MailOutboxMessageDto | null> {
    const changed = await this.prisma.mailOutboxMessage.updateMany({
      where: { id, companyId: this.companyId, userId: this.userId, status: { in: ["scheduled", "failed"] } },
      data: { status: "cancelled" },
    });

    return changed.count === 0 ? null : await this.findOwnOutboxMessage(id);
  }

  async rescheduleOutboxMessage(id: string, sendAt: Date): Promise<MailOutboxMessageDto | null> {
    const changed = await this.prisma.mailOutboxMessage.updateMany({
      where: { id, companyId: this.companyId, userId: this.userId, status: { in: ["scheduled", "failed"] } },
      data: { status: "scheduled", sendAt, attempts: 0, lastError: null, claimedAt: null },
    });

    return changed.count === 0 ? null : await this.findOwnOutboxMessage(id);
  }

  @BypassTenantGuard
  async claimDueOutboxMessagesUnscoped(now: Date, staleBefore: Date, limit: number): Promise<DueOutboxMessage[]> {
    const candidates = await this.prisma.mailOutboxMessage.findMany({
      where: {
        OR: [
          { status: "scheduled", sendAt: { lte: now } },
          { status: "sending", claimedAt: { lt: staleBefore } },
        ],
      },
      select: {
        id: true,
        companyId: true,
        userId: true,
        messagingThreadId: true,
        mode: true,
        replyAll: true,
        body: true,
        recipients: true,
        attempts: true,
        status: true,
        claimedAt: true,
      },
      orderBy: [{ sendAt: "asc" }, { id: "asc" }],
      take: limit,
    });

    const claimed: DueOutboxMessage[] = [];
    for (const candidate of candidates) {
      const won = await this.prisma.mailOutboxMessage.updateMany({
        where: {
          id: candidate.id,
          companyId: candidate.companyId,
          status: candidate.status,
          claimedAt: candidate.claimedAt,
        },
        data: { status: "sending", claimedAt: now },
      });
      if (won.count === 1) {
        claimed.push({
          id: candidate.id,
          companyId: candidate.companyId,
          userId: candidate.userId,
          threadId: candidate.messagingThreadId,
          mode: candidate.mode,
          replyAll: candidate.replyAll,
          body: candidate.body,
          recipients: candidate.recipients,
          attempts: candidate.attempts,
        });
      }
    }

    return claimed;
  }

  @BypassTenantGuard
  async markOutboxSentUnscoped(message: DueOutboxMessage, sentAt: Date): Promise<void> {
    await this.prisma.mailOutboxMessage.updateMany({
      where: { id: message.id, companyId: message.companyId, status: "sending" },
      data: { status: "sent", sentAt, attempts: message.attempts + 1, lastError: null },
    });
  }

  @BypassTenantGuard
  async markOutboxAttemptFailedUnscoped(
    message: DueOutboxMessage,
    outcome: { error: string; retryAt: Date | null },
  ): Promise<void> {
    await this.prisma.mailOutboxMessage.updateMany({
      where: { id: message.id, companyId: message.companyId, status: "sending" },
      data: {
        status: outcome.retryAt ? "scheduled" : "failed",
        ...(outcome.retryAt ? { sendAt: outcome.retryAt } : {}),
        attempts: message.attempts + 1,
        lastError: outcome.error,
        claimedAt: null,
      },
    });
  }

  private async threadState(threadId: string): Promise<ThreadStateDto | null> {
    const row = await this.prisma.messagingThread.findFirst({
      where: { id: threadId, ...this.ownThreadWhere },
      select: { id: true, archivedAt: true, followUpAt: true },
    });

    return row ? { threadId: row.id, archived: Boolean(row.archivedAt), followUpAt: row.followUpAt } : null;
  }

  async setArchived(threadId: string, archived: boolean, now: Date): Promise<ThreadStateDto | null> {
    const changed = await this.prisma.messagingThread.updateMany({
      where: { id: threadId, companyId: this.companyId, provider: "mail", connectedAccount: { userId: this.userId } },
      data: { archivedAt: archived ? now : null },
    });

    return changed.count === 0 ? null : await this.threadState(threadId);
  }

  async setFollowUp(threadId: string, followUpAt: Date | null): Promise<ThreadStateDto | null> {
    const changed = await this.prisma.messagingThread.updateMany({
      where: { id: threadId, companyId: this.companyId, provider: "mail", connectedAccount: { userId: this.userId } },
      data: { followUpAt },
    });

    return changed.count === 0 ? null : await this.threadState(threadId);
  }

  async listLabels(): Promise<MailThreadLabelDto[]> {
    const rows = await this.prisma.mailLabel.findMany({
      where: { companyId: this.companyId },
      select: LABEL_SELECT,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });

    return rows.map(toLabelDto);
  }

  async findLabelByName(name: string): Promise<MailThreadLabelDto | null> {
    const row = await this.prisma.mailLabel.findFirst({
      where: { companyId: this.companyId, name: { equals: name, mode: "insensitive" } },
      select: LABEL_SELECT,
    });

    return row ? toLabelDto(row) : null;
  }

  async createLabel(data: UpsertMailLabelData): Promise<MailThreadLabelDto> {
    const row = await this.prisma.mailLabel.create({
      data: { companyId: this.companyId, name: data.name, color: data.color },
      select: LABEL_SELECT,
    });

    return toLabelDto(row);
  }

  async updateLabel(id: string, data: UpsertMailLabelData): Promise<MailThreadLabelDto | null> {
    const changed = await this.prisma.mailLabel.updateMany({
      where: { id, companyId: this.companyId },
      data: { name: data.name, color: data.color },
    });
    if (changed.count === 0) return null;

    const row = await this.prisma.mailLabel.findFirst({
      where: { id, companyId: this.companyId },
      select: LABEL_SELECT,
    });

    return row ? toLabelDto(row) : null;
  }

  async deleteLabel(id: string): Promise<boolean> {
    const deleted = await this.prisma.mailLabel.deleteMany({ where: { id, companyId: this.companyId } });

    return deleted.count > 0;
  }

  async countLabels(ids: readonly string[]): Promise<number> {
    return await this.prisma.mailLabel.count({ where: { companyId: this.companyId, id: { in: [...ids] } } });
  }

  async threadIsReadable(threadId: string): Promise<boolean> {
    const thread = await this.prisma.messagingThread.findFirst({
      where: {
        id: threadId,
        companyId: this.companyId,
        provider: "mail",
        OR: [{ connectedAccount: { userId: this.userId } }, { sharedToCrm: true }],
      },
      select: { id: true },
    });

    return thread !== null;
  }

  @Transaction
  async setThreadLabels(threadId: string, labelIds: readonly string[]): Promise<MailThreadLabelDto[]> {
    const { companyId } = this;

    await this.prisma.messagingThreadLabel.deleteMany({
      where: { companyId, messagingThreadId: threadId, mailLabelId: { notIn: [...labelIds] } },
    });
    await this.prisma.messagingThreadLabel.createMany({
      data: labelIds.map((mailLabelId) => ({ companyId, messagingThreadId: threadId, mailLabelId })),
      skipDuplicates: true,
    });

    const rows = await this.prisma.messagingThreadLabel.findMany({
      where: { companyId, messagingThreadId: threadId },
      select: { label: { select: LABEL_SELECT } },
      orderBy: { label: { name: "asc" } },
    });

    return rows.map(({ label }) => toLabelDto(label));
  }
}
