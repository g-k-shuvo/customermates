import type { z } from "zod";

import type { DueMailbox } from "@/features/mailbox/sync/sync-due-mailboxes.repo";
import type { WorkflowTenant } from "./workflow-tenant";

import { getDueMailboxRepo, getListSyncFoldersInteractor, getSyncMailboxInteractor } from "@/core/di";
import { runAsBackgroundTenant } from "@/core/decorators/background-tenant";
import { isInteractorFailure, serializeInteractorFailure } from "@/core/validation/validation.utils";
import { DEFAULT_SYNC_FOLDER } from "@/features/mailbox/sync/select-sync-folders";

import { reportWarning, toWorkflowFailure, reportFailure } from "./capture-failure";

const WORKFLOW_NAME = "sync-mailboxes";

const MAILBOXES_PER_RUN = 25;
const PAGES_PER_FOLDER = 20;
const BATCH_SIZE = 100;
const SYNC_INTERVAL_MS = 5 * 60_000;

export type SyncMailboxesPayload = {
  tenant?: WorkflowTenant;
};

async function listDueMailboxes(): Promise<DueMailbox[]> {
  "use step";
  const before = new Date(Date.now() - SYNC_INTERVAL_MS);

  return await getDueMailboxRepo().findDueMailboxesUnscoped(before, MAILBOXES_PER_RUN);
}
listDueMailboxes.maxRetries = 3;

export type FolderListing = { folders: string[]; failure: string | null };

function failureLabel(error: z.ZodError): string {
  const serialized = serializeInteractorFailure(error);

  return serialized.issues.find((issue) => issue.customCode)?.customCode ?? serialized.kind;
}

async function listFolders(mailbox: DueMailbox): Promise<FolderListing> {
  "use step";

  return await runAsBackgroundTenant(mailbox.userId, async () => {
    const outcome = await getListSyncFoldersInteractor().invoke({ connectedAccountId: mailbox.connectedAccountId });

    if (isInteractorFailure(outcome)) return { folders: [DEFAULT_SYNC_FOLDER], failure: failureLabel(outcome.error) };

    return { folders: outcome.data, failure: null };
  });
}
listFolders.maxRetries = 2;

async function syncOnePage(
  mailbox: DueMailbox,
  folderPath: string,
): Promise<{ reachedEnd: boolean; stored: number; failed: boolean }> {
  "use step";

  return await runAsBackgroundTenant(mailbox.userId, async () => {
    const outcome = await getSyncMailboxInteractor().invoke({
      connectedAccountId: mailbox.connectedAccountId,
      folderPath,
      batchSize: BATCH_SIZE,
    });

    if (isInteractorFailure(outcome)) return { reachedEnd: true, stored: 0, failed: true };

    return { reachedEnd: outcome.data.reachedEnd, stored: outcome.data.messagesStored, failed: false };
  });
}
syncOnePage.maxRetries = 2;

async function drainFolder(mailbox: DueMailbox, folderPath: string, tenant?: WorkflowTenant): Promise<void> {
  for (let page = 0; page < PAGES_PER_FOLDER; page += 1) {
    const result = await syncOnePage(mailbox, folderPath);

    if (result.failed) {
      await reportWarning(
        WORKFLOW_NAME,
        `mailbox ${mailbox.connectedAccountId} did not sync ${folderPath}; it is left for the next run`,
        tenant,
      );

      return;
    }

    if (result.reachedEnd) return;
  }

  await reportWarning(
    WORKFLOW_NAME,
    `mailbox ${mailbox.connectedAccountId} still had mail in ${folderPath} after ${PAGES_PER_FOLDER} pages; the rest follows next run`,
    tenant,
  );
}

async function drainMailbox(mailbox: DueMailbox, tenant?: WorkflowTenant): Promise<void> {
  const { folders, failure } = await listFolders(mailbox);

  if (failure) {
    await reportWarning(
      WORKFLOW_NAME,
      `mailbox ${mailbox.connectedAccountId} did not list its folders (${failure}); syncing ${folders.join(", ")} this run`,
      tenant,
    );
  }

  if (folders.length === 0) {
    await reportWarning(
      WORKFLOW_NAME,
      `mailbox ${mailbox.connectedAccountId} reported no folders to sync; it is left for the next run`,
      tenant,
    );

    return;
  }

  for (const folderPath of folders) await drainFolder(mailbox, folderPath, tenant);
}

export async function syncMailboxes(payload: SyncMailboxesPayload): Promise<void> {
  "use workflow";
  const { tenant } = payload;

  const due = await listDueMailboxes();

  for (const mailbox of due) {
    try {
      await drainMailbox(mailbox, tenant);
    } catch (err) {
      await reportFailure(WORKFLOW_NAME, toWorkflowFailure(err), {
        userId: mailbox.userId,
        companyId: mailbox.companyId,
      });
    }
  }
}
