import type { SyncMailboxRepo } from "./sync-mailbox.repo";
import type { SyncMailboxService } from "./sync-mailbox.service";
import type { Validated } from "@/core/validation/validation.utils";

import { Resource, Action } from "@/generated/prisma";

import {
  MailboxSyncOutcomeSchema,
  SyncMailboxSchema,
  type MailboxSyncOutcome,
  type SyncMailboxData,
} from "../mailbox.schema";
import { DEFAULT_SYNC_FOLDER } from "./select-sync-folders";
import { MailboxTransportError } from "./mailbox-transport";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { fail, failNotFound, failUnavailable } from "@/core/validation/interactor-failure-server";

@TenantInteractor({
  resource: Resource.inboxMessages,
  action: Action.update,
})
export class SyncMailboxInteractor extends AuthenticatedInteractor<SyncMailboxData, MailboxSyncOutcome> {
  constructor(
    private repo: SyncMailboxRepo,
    private service: SyncMailboxService | null,
  ) {
    super();
  }

  @Write({
    input: SyncMailboxSchema,
    output: MailboxSyncOutcomeSchema,
  })
  async invoke(data: SyncMailboxData): Validated<MailboxSyncOutcome> {
    const service = this.service;
    if (!service) return failUnavailable(CustomErrorCode.mailboxSecretKeyMissing);

    const account = await this.repo.getMailboxAccount(data.connectedAccountId);
    if (!account) return failNotFound(CustomErrorCode.mailboxNotFound, ["connectedAccountId"]);

    try {
      const outcome = await service.syncFolder(account, data.folderPath ?? DEFAULT_SYNC_FOLDER, data.batchSize);

      return { ok: true as const, data: outcome };
    } catch (error) {
      if (error instanceof MailboxTransportError) return await fail(CustomErrorCode.mailboxUnreachable);

      throw error;
    }
  }
}
