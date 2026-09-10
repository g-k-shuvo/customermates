import type { SyncMailboxRepo } from "./sync-mailbox.repo";
import type { SyncMailboxService } from "./sync-mailbox.service";
import type { Validated } from "@/core/validation/validation.utils";

import { z } from "zod";

import { Resource, Action } from "@/generated/prisma";

import { MailboxAccountRefSchema, type MailboxAccountRefData } from "../mailbox.schema";
import { MailboxTransportError } from "./mailbox-transport";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { fail, failNotFound, failUnavailable } from "@/core/validation/interactor-failure-server";

@TenantInteractor({
  permissions: [
    { resource: Resource.inboxMessages, action: Action.readAll },
    { resource: Resource.inboxMessages, action: Action.readOwn },
  ],
  condition: "OR",
})
export class ListSyncFoldersInteractor extends AuthenticatedInteractor<MailboxAccountRefData, string[]> {
  constructor(
    private repo: SyncMailboxRepo,
    private service: SyncMailboxService | null,
  ) {
    super();
  }

  @Validate(MailboxAccountRefSchema)
  @ValidateOutput(z.string())
  async invoke(data: MailboxAccountRefData): Validated<string[]> {
    const service = this.service;
    if (!service) return failUnavailable(CustomErrorCode.mailboxSecretKeyMissing);

    const account = await this.repo.getMailboxAccount(data.connectedAccountId);
    if (!account) return failNotFound(CustomErrorCode.mailboxNotFound, ["connectedAccountId"]);

    try {
      return { ok: true as const, data: await service.listSyncFolders(account) };
    } catch (error) {
      if (error instanceof MailboxTransportError) return await fail(CustomErrorCode.mailboxUnreachable);

      throw error;
    }
  }
}
