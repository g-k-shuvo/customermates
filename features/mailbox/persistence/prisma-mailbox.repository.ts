import { randomUUID } from "node:crypto";

import type { NormalizedMessage } from "../sync/normalize-message";
import type { PlannedThread } from "../sync/sync-plan";
import type { MailboxCredentialDto, MailboxFolderCursorDto } from "../mailbox.schema";
import type { CreateMailboxArgs } from "../connect/connect-mailbox.repo";

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

const THREAD_SUMMARY_SELECT = {
  id: true,
  subject: true,
  lastMessageAt: true,
  lastMessagePreview: true,
  lastMessageIsSender: true,
  state: true,
  sharedToCrm: true,
  participants: { select: { identifier: true, displayName: true, isSelf: true } },
} as const;

const MAILBOX_CREDENTIAL_SELECT = {
  id: true,
  connectedAccountId: true,
  imapHost: true,
  imapPort: true,
  imapSecure: true,
  username: true,
  syncCursors: true,
  backfillFrom: true,
  lastSyncedAt: true,
  lastVerifiedAt: true,
} as const;

type MailboxCredentialRow = {
  id: string;
  connectedAccountId: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  username: string;
  syncCursors: unknown;
  backfillFrom: Date | null;
  lastSyncedAt: Date | null;
  lastVerifiedAt: Date | null;
};

function toMailboxCredentialDto(row: MailboxCredentialRow): MailboxCredentialDto {
  return {
    id: row.id,
    connectedAccountId: row.connectedAccountId,
    imapHost: row.imapHost,
    imapPort: row.imapPort,
    imapSecure: row.imapSecure,
    username: row.username,
    syncCursors: MailboxFolderCursorListSchema.catch([]).parse(row.syncCursors),
    backfillFrom: row.backfillFrom,
    lastSyncedAt: row.lastSyncedAt,
    lastVerifiedAt: row.lastVerifiedAt,
  };
}

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

  async createMailboxOrThrow(args: CreateMailboxArgs): Promise<MailboxCredentialDto> {
    const { companyId, userId } = this;

    const account = await this.prisma.connectedAccount.create({
      data: {
        companyId,
        userId,
        unipileAccountId: `imap:${randomUUID()}`,
        provider: "mail",
        status: "ok",
        hasMessaging: true,
        emailAddress: args.emailAddress,
        displayName: args.displayName,
      },
      select: { id: true },
    });

    const credential = await this.prisma.mailboxCredential.create({
      data: {
        companyId,
        connectedAccountId: account.id,
        imapHost: args.imapHost,
        imapPort: args.imapPort,
        imapSecure: args.imapSecure,
        username: args.username,
        sealedSecret: args.sealedSecret,
        backfillFrom: args.backfillFrom,
        lastVerifiedAt: args.verifiedAt,
      },
      select: MAILBOX_CREDENTIAL_SELECT,
    });

    return toMailboxCredentialDto(credential);
  }

  async findMailboxByAddress(emailAddress: string): Promise<MailboxCredentialDto | null> {
    const credential = await this.prisma.mailboxCredential.findFirst({
      where: { companyId: this.companyId, connectedAccount: { emailAddress } },
      select: MAILBOX_CREDENTIAL_SELECT,
    });

    return credential ? toMailboxCredentialDto(credential) : null;
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
      select: THREAD_SUMMARY_SELECT,
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

  async listThreadsForMailboxes(limit: number) {
    return await this.prisma.messagingThread.findMany({
      where: { companyId: this.companyId, provider: "mail" },
      select: THREAD_SUMMARY_SELECT,
      orderBy: [{ lastMessageAt: "desc" }, { id: "asc" }],
      take: limit,
    });
  }

  async findThreadWithMessages(messagingThreadId: string) {
    return await this.prisma.messagingThread.findFirst({
      where: { id: messagingThreadId, companyId: this.companyId, provider: "mail" },
      select: {
        ...THREAD_SUMMARY_SELECT,
        messages: {
          select: {
            id: true,
            subject: true,
            bodyText: true,
            bodyHtml: true,
            direction: true,
            isDraft: true,
            sentAt: true,
            senderIdentifier: true,
          },
          orderBy: [{ sentAt: "asc" }, { id: "asc" }],
          take: 500,
        },
      },
    });
  }

  async markThreadRead(messagingThreadId: string): Promise<void> {
    const { companyId } = this;

    await this.prisma.messagingThread.updateMany({
      where: { id: messagingThreadId, companyId },
      data: { state: "open" },
    });
  }

  async findReplyContext(messagingThreadId: string) {
    const thread = await this.prisma.messagingThread.findFirst({
      where: { id: messagingThreadId, companyId: this.companyId, provider: "mail" },
      select: {
        id: true,
        subject: true,
        unipileThreadId: true,
        connectedAccountId: true,
        messages: {
          select: {
            unipileMessageId: true,
            subject: true,
            senderIdentifier: true,
            recipients: true,
            direction: true,
          },
          orderBy: [{ sentAt: "desc" }, { id: "desc" }],
          take: 1,
        },
      },
    });

    if (!thread) return null;

    const credential = await this.prisma.mailboxCredential.findFirst({
      where: { companyId: this.companyId, connectedAccountId: thread.connectedAccountId },
      select: {
        imapHost: true,
        imapPort: true,
        imapSecure: true,
        smtpHost: true,
        smtpPort: true,
        smtpSecure: true,
        username: true,
        sealedSecret: true,
        connectedAccount: { select: { emailAddress: true, displayName: true } },
      },
    });

    return credential ? { thread, credential } : null;
  }

  async storeOutboundReply(args: {
    messagingThreadId: string;
    connectedAccountId: string;
    storedMessageId: string;
    subject: string;
    body: string;
    senderIdentifier: string;
    recipients: string[];
    sentAt: Date;
  }): Promise<void> {
    const { companyId } = this;

    await this.prisma.messagingMessage.create({
      data: {
        companyId,
        messagingThreadId: args.messagingThreadId,
        connectedAccountId: args.connectedAccountId,
        unipileMessageId: args.storedMessageId,
        provider: "mail",
        direction: "outbound",
        origin: "external",
        sender: { identifier: args.senderIdentifier, displayName: null, attendeeId: args.senderIdentifier },
        senderIdentifier: args.senderIdentifier,
        recipients: {
          to: args.recipients.map((identifier) => ({ identifier, attendeeId: identifier })),
          cc: [],
          bcc: [],
        },
        subject: args.subject,
        bodyText: args.body,
        folderIds: [],
        isDraft: false,
        sentAt: args.sentAt,
      },
    });

    await this.prisma.messagingThread.updateMany({
      where: { id: args.messagingThreadId, companyId },
      data: {
        lastMessageAt: args.sentAt,
        lastMessagePreview: args.body.replace(/\s+/g, " ").trim().slice(0, PREVIEW_LENGTH) || null,
        lastMessageIsSender: true,
      },
    });
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
