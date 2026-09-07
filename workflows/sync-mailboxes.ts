import type { DueMailbox } from "@/features/mailbox/sync/sync-due-mailboxes.repo";
import type { WorkflowTenant } from "./workflow-tenant";

import { getDueMailboxRepo, getSyncMailboxInteractor } from "@/core/di";
import { runAsBackgroundTenant } from "@/core/decorators/background-tenant";
import { isInteractorFailure } from "@/core/validation/validation.utils";

import { reportWarning, toWorkflowFailure, reportFailure } from "./capture-failure";

const WORKFLOW_NAME = "sync-mailboxes";

const MAILBOXES_PER_RUN = 25;
const PAGES_PER_MAILBOX = 20;
const BATCH_SIZE = 100;
const SYNC_INTERVAL_MS = 5 * 60_000;

export type SyncMailboxesPayload = {
  tenant?: WorkflowTenant;
};

async function listDueMailboxes(): Promise<DueMailbox[]> {
  "use step";
  const before = new Date(Date.now() - SYNC_INTERVAL_MS);

  return await getDueMailboxRepo().findDueMailboxes(before, MAILBOXES_PER_RUN);
}
listDueMailboxes.maxRetries = 3;

async function syncOnePage(mailbox: DueMailbox): Promise<{ reachedEnd: boolean; stored: number; failed: boolean }> {
  "use step";

  return await runAsBackgroundTenant(mailbox.userId, async () => {
    const outcome = await getSyncMailboxInteractor().invoke({
      connectedAccountId: mailbox.connectedAccountId,
      batchSize: BATCH_SIZE,
    });

    if (isInteractorFailure(outcome)) return { reachedEnd: true, stored: 0, failed: true };

    return { reachedEnd: outcome.data.reachedEnd, stored: outcome.data.messagesStored, failed: false };
  });
}
syncOnePage.maxRetries = 2;

async function drainMailbox(mailbox: DueMailbox, tenant?: WorkflowTenant): Promise<void> {
  for (let page = 0; page < PAGES_PER_MAILBOX; page += 1) {
    const result = await syncOnePage(mailbox);

    if (result.failed) {
      await reportWarning(
        WORKFLOW_NAME,
        `mailbox ${mailbox.connectedAccountId} did not sync; it is left for the next run`,
        tenant,
      );

      return;
    }

    if (result.reachedEnd) return;
  }

  await reportWarning(
    WORKFLOW_NAME,
    `mailbox ${mailbox.connectedAccountId} still had mail after ${PAGES_PER_MAILBOX} pages; the rest follows next run`,
    tenant,
  );
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
