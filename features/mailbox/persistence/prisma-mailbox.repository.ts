import { randomUUID } from "node:crypto";

import type { NormalizedMessage } from "../sync/normalize-message";
import type { PlannedThread } from "../sync/sync-plan";
import type { MailboxAccountDto, MailboxCredentialDto, MailboxFolderCursorDto } from "../mailbox.schema";
import type { CreateMailboxArgs } from "../connect/connect-mailbox.repo";
import type { MailboxThreadFilter } from "../get/mailbox-thread-filter";

import { MailboxFolderCursorListSchema } from "../mailbox.schema";

import { toThreadPreview } from "./thread-preview";

import { BaseRepository } from "@/core/base/base-repository";
import { Transaction } from "@/core/decorators/transaction.decorator";

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

export type StoredThread = { id: string; threadKey: string; created: boolean };

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

const MAILBOX_ACCOUNT_SELECT = {
  ...MAILBOX_CREDENTIAL_SELECT,
  smtpHost: true,
  smtpPort: true,
  smtpSecure: true,
  connectedAccount: { select: { emailAddress: true, displayName: true } },
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

type MailboxAccountRow = MailboxCredentialRow & {
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean | null;
  connectedAccount: { emailAddress: string | null; displayName: string | null };
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

function toMailboxAccountDto(row: MailboxAccountRow): MailboxAccountDto {
  return {
    ...toMailboxCredentialDto(row),
    emailAddress: row.connectedAccount.emailAddress ?? row.username,
    displayName: row.connectedAccount.displayName,
    smtpHost: row.smtpHost,
    smtpPort: row.smtpPort,
    smtpSecure: row.smtpSecure,
  };
}

const STORED_FOLDER_LIMIT = 200;

function byCodeUnitOrder(left: string, right: string): number {
  if (left === right) return 0;

  return left < right ? -1 : 1;
}

function folderWhere(companyId: string, folder: string | null) {
  if (!folder) return {};

  return { messages: { some: { companyId, folderIds: { has: folder } } } };
}

function searchWhere(companyId: string, search: string | null) {
  if (!search) return {};

  const insensitive = { contains: search, mode: "insensitive" } as const;

  return {
    OR: [
      { subject: insensitive },
      {
        participants: {
          some: { companyId, OR: [{ identifier: insensitive }, { displayName: insensitive }] },
        },
      },
    ],
  };
}

function previewOf(message: NormalizedMessage): string | null {
  const body = message.message.bodyText ?? message.message.bodyHtml;
  if (!body) return null;

  return toThreadPreview(body);
}

export class PrismaMailboxRepo extends BaseRepository {
  private get ownedByCaller() {
    return { connectedAccount: { userId: this.userId } };
  }

  private get readableByCaller() {
    return { OR: [{ ...this.ownedByCaller }, { sharedToCrm: true }] };
  }

  async getMailboxAccounts(): Promise<MailboxAccount[]> {
    const rows = await this.prisma.mailboxCredential.findMany({
      where: { companyId: this.companyId, ...this.ownedByCaller },
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
    const threadKey = { connectedAccountId, unipileThreadId: thread.threadKey };

    const known = await this.prisma.messagingThread.findUnique({
      where: { connectedAccountId_unipileThreadId: threadKey, companyId },
      select: { id: true },
    });

    const stored = await this.prisma.messagingThread.upsert({
      where: { connectedAccountId_unipileThreadId: threadKey, companyId },
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

    return { id: stored.id, threadKey: thread.threadKey, created: known === null };
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
      if (folderIds.length !== existing.folderIds.length) {
        await this.prisma.messagingMessage.updateMany({
          where: { id: existing.id, companyId, ...this.ownedByCaller },
          data: { folderIds },
        });
      }

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

  async deleteThreadIfEmpty(messagingThreadId: string): Promise<void> {
    const { companyId } = this;

    await this.prisma.messagingThread.deleteMany({
      where: { id: messagingThreadId, companyId, ...this.ownedByCaller, messages: { none: {} } },
    });
  }

  async refreshThreadSummary(messagingThreadId: string, latest: NormalizedMessage): Promise<void> {
    const { companyId } = this;

    await this.prisma.messagingThread.updateMany({
      where: {
        id: messagingThreadId,
        companyId,
        ...this.ownedByCaller,
        OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: latest.message.sentAt } }],
      },
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
        smtpHost: args.smtpHost,
        smtpPort: args.smtpPort,
        smtpSecure: args.smtpSecure,
        backfillFrom: args.backfillFrom,
        lastVerifiedAt: args.verifiedAt,
      },
      select: MAILBOX_CREDENTIAL_SELECT,
    });

    return toMailboxCredentialDto(credential);
  }

  async listConnectedMailboxes(): Promise<MailboxAccountDto[]> {
    const rows = await this.prisma.mailboxCredential.findMany({
      where: { companyId: this.companyId, ...this.ownedByCaller },
      select: MAILBOX_ACCOUNT_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    return rows.map(toMailboxAccountDto);
  }

  async findConnectedMailbox(connectedAccountId: string): Promise<MailboxAccountDto | null> {
    const row = await this.prisma.mailboxCredential.findFirst({
      where: { companyId: this.companyId, connectedAccountId, ...this.ownedByCaller },
      select: MAILBOX_ACCOUNT_SELECT,
    });

    return row ? toMailboxAccountDto(row) : null;
  }

  async deleteConnectedMailbox(connectedAccountId: string): Promise<void> {
    await this.prisma.connectedAccount.deleteMany({
      where: { id: connectedAccountId, companyId: this.companyId, userId: this.userId },
    });
  }

  async findConnectedMailboxCompanyWide(connectedAccountId: string): Promise<MailboxAccountDto | null> {
    const row = await this.prisma.mailboxCredential.findFirst({
      where: { companyId: this.companyId, connectedAccountId },
      select: MAILBOX_ACCOUNT_SELECT,
    });

    return row ? toMailboxAccountDto(row) : null;
  }

  async deleteConnectedMailboxCompanyWide(connectedAccountId: string): Promise<void> {
    await this.prisma.connectedAccount.deleteMany({
      where: { id: connectedAccountId, companyId: this.companyId },
    });
  }

  async findMailboxByAddress(emailAddress: string): Promise<MailboxCredentialDto | null> {
    const credential = await this.prisma.mailboxCredential.findFirst({
      where: { companyId: this.companyId, connectedAccount: { emailAddress, userId: this.userId } },
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
      where: { companyId: this.companyId, contactId: { in: [...contactIds] }, deal: { is: this.accessWhere("deal") } },
      select: { dealId: true, contactId: true, deal: { select: { status: true } } },
    });

    return rows.map((row) => ({ dealId: row.dealId, contactId: row.contactId, isOpen: row.deal.status === "open" }));
  }

  async findSharedThreadsForIdentifiersCompanyWide(identifiers: readonly string[]) {
    if (identifiers.length === 0) return [];

    return await this.prisma.messagingThread.findMany({
      where: {
        companyId: this.companyId,
        provider: "mail",
        sharedToCrm: true,
        participants: { some: { companyId: this.companyId, identifier: { in: [...identifiers] } } },
      },
      select: THREAD_SUMMARY_SELECT,
      orderBy: [{ lastMessageAt: "desc" }, { id: "asc" }],
      take: 100,
    });
  }

  async findDealNames(dealIds: readonly string[]): Promise<{ id: string; name: string }[]> {
    if (dealIds.length === 0) return [];

    return await this.prisma.deal.findMany({
      where: { id: { in: [...dealIds] }, ...this.accessWhere("deal") },
      select: { id: true, name: true },
    });
  }

  async findThreadForDealLink(messagingThreadId: string) {
    return await this.prisma.messagingThread.findFirst({
      where: { id: messagingThreadId, companyId: this.companyId, provider: "mail", ...this.ownedByCaller },
      select: {
        id: true,
        sharedToCrm: true,
        linkedDealId: true,
        participants: { select: { identifier: true, isSelf: true } },
      },
    });
  }

  async setThreadDeal(messagingThreadId: string, dealId: string | null): Promise<void> {
    const { companyId } = this;

    await this.prisma.messagingThread.updateMany({
      where: { id: messagingThreadId, companyId, ...this.ownedByCaller },
      data: { linkedDealId: dealId },
    });
  }

  async findThreadsLinkedToDealCompanyWide(dealId: string) {
    return await this.prisma.messagingThread.findMany({
      where: {
        companyId: this.companyId,
        provider: "mail",
        sharedToCrm: true,
        linkedDealId: dealId,
        linkedDeal: { is: this.accessWhere("deal") },
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
      where: { companyId: this.companyId, dealId, deal: { is: this.accessWhere("deal") } },
      select: { contactId: true },
    });

    return rows.map((row) => row.contactId);
  }

  async listThreadsForMailboxes(limit: number, filter: MailboxThreadFilter) {
    return await this.prisma.messagingThread.findMany({
      where: {
        companyId: this.companyId,
        provider: "mail",
        ...this.ownedByCaller,
        ...folderWhere(this.companyId, filter.folder),
        ...searchWhere(this.companyId, filter.search),
      },
      select: THREAD_SUMMARY_SELECT,
      orderBy: [{ lastMessageAt: "desc" }, { id: "asc" }],
      take: limit,
    });
  }

  async listStoredMailboxFolders(): Promise<string[]> {
    const rows = await this.prisma.mailboxCredential.findMany({
      where: { companyId: this.companyId, ...this.ownedByCaller },
      select: { syncCursors: true },
    });

    const paths = new Set<string>();
    for (const row of rows)
      for (const cursor of MailboxFolderCursorListSchema.catch([]).parse(row.syncCursors)) paths.add(cursor.path);

    return [...paths].sort(byCodeUnitOrder).slice(0, STORED_FOLDER_LIMIT);
  }

  async findThreadWithMessages(messagingThreadId: string) {
    return await this.prisma.messagingThread.findFirst({
      where: { id: messagingThreadId, companyId: this.companyId, provider: "mail", ...this.readableByCaller },
      select: {
        ...THREAD_SUMMARY_SELECT,
        linkedDealId: true,
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
      where: { id: messagingThreadId, companyId, ...this.ownedByCaller },
      data: { state: "open" },
    });
  }

  async findReplyContext(messagingThreadId: string) {
    const thread = await this.prisma.messagingThread.findFirst({
      where: { id: messagingThreadId, companyId: this.companyId, provider: "mail", ...this.ownedByCaller },
      select: {
        id: true,
        subject: true,
        unipileThreadId: true,
        connectedAccountId: true,
        messages: {
          select: {
            unipileMessageId: true,
            subject: true,
            sender: true,
            senderIdentifier: true,
            recipients: true,
            direction: true,
            bodyText: true,
            sentAt: true,
          },
          orderBy: [{ sentAt: "desc" }, { id: "desc" }],
          take: 1,
        },
      },
    });

    if (!thread) return null;

    const credential = await this.prisma.mailboxCredential.findFirst({
      where: { companyId: this.companyId, connectedAccountId: thread.connectedAccountId, ...this.ownedByCaller },
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

  @Transaction
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
      where: {
        id: args.messagingThreadId,
        companyId,
        ...this.ownedByCaller,
        OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: args.sentAt } }],
      },
      data: {
        lastMessageAt: args.sentAt,
        lastMessagePreview: toThreadPreview(args.body),
        lastMessageIsSender: true,
      },
    });
  }

  async setThreadShared(messagingThreadId: string, shared: boolean): Promise<void> {
    const { companyId } = this;

    await this.prisma.messagingThread.updateMany({
      where: { id: messagingThreadId, companyId, ...this.ownedByCaller },
      data: { sharedToCrm: shared },
    });
  }

  async saveCursor(connectedAccountId: string, cursor: MailboxFolderCursorDto, syncedAt: Date): Promise<void> {
    const { companyId } = this;
    const account = await this.getMailboxAccount(connectedAccountId);
    const retained = (account?.syncCursors ?? []).filter((entry) => entry.path !== cursor.path);

    await this.prisma.mailboxCredential.updateMany({
      where: { connectedAccountId, companyId, ...this.ownedByCaller },
      data: { syncCursors: [...retained, cursor], lastSyncedAt: syncedAt },
    });
  }
}
