import type { NormalizedMessage } from "../sync/normalize-message";
import type { PlannedThread } from "../sync/sync-plan";
import type { MailboxFolderCursorDto } from "../mailbox.schema";

import { MailboxFolderCursorListSchema } from "../mailbox.schema";

import { BaseRepository } from "@/core/base/base-repository";

export type MailboxAccount = {
  connectedAccountId: string;
  emailAddress: string;
  displayName: string | null;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  username: string;
  sealedSecret: string;
  syncCursors: MailboxFolderCursorDto[];
  backfillFrom: Date | null;
};

export type StoredThread = { id: string; threadKey: string };

const PREVIEW_LENGTH = 280;

function previewOf(message: NormalizedMessage): string | null {
  const body = message.message.bodyText ?? message.message.bodyHtml;
  if (!body) return null;

  return body.replace(/\s+/g, " ").trim().slice(0, PREVIEW_LENGTH) || null;
}

export class PrismaMailboxRepo extends BaseRepository {
  async getMailboxAccounts(): Promise<MailboxAccount[]> {
    const rows = await this.prisma.mailboxCredential.findMany({
      where: { companyId: this.companyId },
      select: {
        connectedAccountId: true,
        imapHost: true,
        imapPort: true,
        imapSecure: true,
        username: true,
        sealedSecret: true,
        syncCursors: true,
        backfillFrom: true,
        connectedAccount: { select: { emailAddress: true, displayName: true } },
      },
    });

    return rows.map((row) => ({
      connectedAccountId: row.connectedAccountId,
      emailAddress: row.connectedAccount.emailAddress ?? row.username,
      displayName: row.connectedAccount.displayName,
      imapHost: row.imapHost,
      imapPort: row.imapPort,
      imapSecure: row.imapSecure,
      username: row.username,
      sealedSecret: row.sealedSecret,
      syncCursors: MailboxFolderCursorListSchema.catch([]).parse(row.syncCursors),
      backfillFrom: row.backfillFrom,
    }));
  }

  async getMailboxAccount(connectedAccountId: string): Promise<MailboxAccount | null> {
    const accounts = await this.getMailboxAccounts();

    return accounts.find((account) => account.connectedAccountId === connectedAccountId) ?? null;
  }

  async upsertThread(connectedAccountId: string, thread: PlannedThread): Promise<StoredThread> {
    const { companyId } = this;

    const stored = await this.prisma.messagingThread.upsert({
      where: {
        connectedAccountId_unipileThreadId: { connectedAccountId, unipileThreadId: thread.threadKey },
        companyId,
      },
      create: {
        companyId,
        connectedAccountId,
        unipileThreadId: thread.threadKey,
        provider: "mail",
        type: "single",
        subject: thread.subject,
      },
      update: { companyId, subject: thread.subject ?? undefined },
      select: { id: true },
    });

    return { id: stored.id, threadKey: thread.threadKey };
  }

  async storeMessage(normalized: NormalizedMessage): Promise<boolean> {
    const { companyId } = this;
    const { message } = normalized;

    const existing = await this.prisma.messagingMessage.findUnique({
      where: {
        connectedAccountId_unipileMessageId: {
          connectedAccountId: message.connectedAccountId,
          unipileMessageId: message.unipileMessageId,
        },
        companyId,
      },
      select: { id: true, folderIds: true },
    });

    if (existing) {
      const folderIds = Array.from(new Set([...existing.folderIds, ...message.folderIds]));
      if (folderIds.length !== existing.folderIds.length)
        await this.prisma.messagingMessage.updateMany({ where: { id: existing.id, companyId }, data: { folderIds } });

      return false;
    }

    await this.prisma.messagingMessage.create({
      data: {
        companyId,
        messagingThreadId: message.messagingThreadId,
        connectedAccountId: message.connectedAccountId,
        unipileMessageId: message.unipileMessageId,
        providerMessageId: message.providerMessageId,
        provider: message.provider,
        direction: message.direction,
        origin: message.origin,
        sender: message.sender,
        senderIdentifier: message.senderIdentifier,
        recipients: message.recipients,
        subject: message.subject,
        bodyText: message.bodyText,
        bodyHtml: message.bodyHtml,
        folderIds: message.folderIds,
        isDraft: message.isDraft,
        sentAt: message.sentAt,
      },
    });

    return true;
  }

  async storeParticipants(normalized: NormalizedMessage): Promise<void> {
    const { companyId } = this;

    for (const participant of normalized.participants) {
      await this.prisma.messagingThreadParticipant.upsert({
        where: {
          messagingThreadId_identifier: {
            messagingThreadId: participant.messagingThreadId,
            identifier: participant.identifier,
          },
          companyId,
        },
        create: {
          companyId,
          messagingThreadId: participant.messagingThreadId,
          provider: participant.provider,
          providerUserId: participant.providerUserId,
          identifier: participant.identifier,
          displayName: participant.displayName,
          isSelf: participant.isSelf,
        },
        update: { companyId, displayName: participant.displayName ?? undefined },
      });
    }
  }

  async refreshThreadSummary(messagingThreadId: string, latest: NormalizedMessage): Promise<void> {
    const { companyId } = this;

    await this.prisma.messagingThread.updateMany({
      where: { id: messagingThreadId, companyId },
      data: {
        lastMessageAt: latest.message.sentAt,
        lastMessagePreview: previewOf(latest),
        lastMessageIsSender: latest.message.direction === "outbound",
      },
    });
  }

  async findContactMatches(identifiers: readonly string[]): Promise<{ identifier: string; contactId: string }[]> {
    if (identifiers.length === 0) return [];

    const rows = await this.prisma.contactIdentifier.findMany({
      where: { companyId: this.companyId, channelClass: "email", value: { in: [...identifiers] } },
      select: { value: true, contactId: true },
    });

    return rows.map((row) => ({ identifier: row.value, contactId: row.contactId }));
  }

  async findDealCandidates(contactIds: readonly string[]) {
    if (contactIds.length === 0) return [];

    const rows = await this.prisma.dealContact.findMany({
      where: { companyId: this.companyId, contactId: { in: [...contactIds] } },
      select: { dealId: true, contactId: true, deal: { select: { status: true } } },
    });

    return rows.map((row) => ({ dealId: row.dealId, contactId: row.contactId, isOpen: row.deal.status === "open" }));
  }

  async findThreadsForIdentifiers(identifiers: readonly string[], sharedOnly: boolean) {
    if (identifiers.length === 0) return [];

    return await this.prisma.messagingThread.findMany({
      where: {
        companyId: this.companyId,
        provider: "mail",
        ...(sharedOnly ? { sharedToCrm: true } : {}),
        participants: { some: { companyId: this.companyId, identifier: { in: [...identifiers] } } },
      },
      select: {
        id: true,
        subject: true,
        lastMessageAt: true,
        lastMessagePreview: true,
        lastMessageIsSender: true,
        state: true,
        sharedToCrm: true,
      },
      orderBy: [{ lastMessageAt: "desc" }, { id: "asc" }],
      take: 100,
    });
  }

  async findEmailIdentifiersOfContacts(contactIds: readonly string[]): Promise<string[]> {
    if (contactIds.length === 0) return [];

    const rows = await this.prisma.contactIdentifier.findMany({
      where: { companyId: this.companyId, channelClass: "email", contactId: { in: [...contactIds] } },
      select: { value: true },
    });

    return Array.from(new Set(rows.map((row) => row.value)));
  }

  async findContactIdsOnDeal(dealId: string): Promise<string[]> {
    const rows = await this.prisma.dealContact.findMany({
      where: { companyId: this.companyId, dealId },
      select: { contactId: true },
    });

    return rows.map((row) => row.contactId);
  }

  async setThreadShared(messagingThreadId: string, shared: boolean): Promise<void> {
    const { companyId } = this;

    await this.prisma.messagingThread.updateMany({
      where: { id: messagingThreadId, companyId },
      data: { sharedToCrm: shared },
    });
  }

  async saveCursor(connectedAccountId: string, cursor: MailboxFolderCursorDto, syncedAt: Date): Promise<void> {
    const { companyId } = this;
    const account = await this.getMailboxAccount(connectedAccountId);
    const retained = (account?.syncCursors ?? []).filter((entry) => entry.path !== cursor.path);

    await this.prisma.mailboxCredential.updateMany({
      where: { connectedAccountId, companyId },
      data: { syncCursors: [...retained, cursor], lastSyncedAt: syncedAt },
    });
  }
}
