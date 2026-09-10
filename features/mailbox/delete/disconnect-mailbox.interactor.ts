import type { DisconnectMailboxRepo } from "./disconnect-mailbox.repo";
import type { Validated } from "@/core/validation/validation.utils";

import { Resource, Action } from "@/generated/prisma";
import { z } from "zod";

import { DisconnectMailboxSchema, type DisconnectMailboxData } from "../mailbox.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { failNotFound } from "@/core/validation/interactor-failure-server";

@TenantInteractor({
  resource: Resource.inboxMessages,
  action: Action.delete,
})
export class DisconnectMailboxInteractor extends AuthenticatedInteractor<DisconnectMailboxData, string> {
  constructor(private repo: DisconnectMailboxRepo) {
    super();
  }

  @Write({
    input: DisconnectMailboxSchema,
    output: z.string(),
  })
  async invoke(data: DisconnectMailboxData): Validated<string> {
    const existing = await this.repo.findConnectedMailbox(data.connectedAccountId);
    if (!existing) return failNotFound(CustomErrorCode.mailboxNotFound, ["connectedAccountId"]);

    await this.repo.deleteConnectedMailbox(data.connectedAccountId);

    return { ok: true as const, data: data.connectedAccountId };
  }
}
