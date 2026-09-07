import type { MailboxAccount, PrismaMailboxRepo } from "../persistence/prisma-mailbox.repository";
import type { MailboxFolderCursorDto, MailboxSyncOutcome } from "../mailbox.schema";
import type { MailboxTransport } from "./mailbox-transport";
import type { SecretBoxKey } from "../credentials/secret-box";

import { openSecret } from "../credentials/secret-box";
import { normalizeMessage, type NormalizedMessage } from "./normalize-message";
import { parseSourceMessage } from "./parse-source";
import { planMailboxSync } from "./sync-plan";

export type MailboxClock = () => Date;

export const DEFAULT_SYNC_FOLDER = "INBOX";

export class SyncMailboxService {
  constructor(
    private repo: PrismaMailboxRepo,
    private transport: MailboxTransport,
    private secretKey: SecretBoxKey,
    private now: MailboxClock,
  ) {}

  async syncFolder(account: MailboxAccount, folderPath: string, batchSize: number): Promise<MailboxSyncOutcome> {
    const cursor = account.syncCursors.find((entry) => entry.path === folderPath) ?? null;
    const page = await this.transport.fetchSince(this.connectionOf(account), cursor, folderPath, batchSize);

    const parsed = [];
    for (const envelope of page.messages) {
      parsed.push(
        await parseSourceMessage({
          uid: envelope.uid,
          source: envelope.source,
          flags: envelope.flags,
          internalDate: envelope.internalDate,
          folderId: folderPath,
        }),
      );
    }

    const plan = planMailboxSync(parsed);
    let messagesStored = 0;

    for (const thread of plan.threads) {
      const stored = await this.repo.upsertThread(account.connectedAccountId, thread);
      let latest: NormalizedMessage | null = null;

      for (const planned of thread.messages) {
        const normalized = normalizeMessage(planned.parsed.message, {
          companyId: this.repo.companyId,
          connectedAccountId: account.connectedAccountId,
          messagingThreadId: stored.id,
          mailboxAddress: account.emailAddress,
          mailboxDisplayName: account.displayName,
        });

        const created = await this.repo.storeMessage(normalized);
        if (created) messagesStored += 1;

        await this.repo.storeParticipants(normalized);

        if (!latest || normalized.message.sentAt >= latest.message.sentAt) latest = normalized;
      }

      if (latest) await this.repo.refreshThreadSummary(stored.id, latest);
    }

    const nextCursor: MailboxFolderCursorDto = page.cursor;
    await this.repo.saveCursor(account.connectedAccountId, nextCursor, this.now());

    return {
      connectedAccountId: account.connectedAccountId,
      folderPath,
      threadsTouched: plan.threads.length,
      messagesStored,
      reachedEnd: page.reachedEnd,
      cursor: nextCursor,
    };
  }

  private connectionOf(account: MailboxAccount) {
    return {
      host: account.imapHost,
      port: account.imapPort,
      secure: account.imapSecure,
      username: account.username,
      secret: openSecret(this.secretKey, account.sealedSecret),
    };
  }
}
