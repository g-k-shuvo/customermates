import type { AdminDisconnectMailboxRepo } from "./admin-disconnect-mailbox.repo";
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
  resource: Resource.company,
  action: Action.update,
})
export class AdminDisconnectMailboxInteractor extends AuthenticatedInteractor<DisconnectMailboxData, string> {
  constructor(private repo: AdminDisconnectMailboxRepo) {
    super();
  }

  @Write({
    input: DisconnectMailboxSchema,
    output: z.string(),
  })
  async invoke(data: DisconnectMailboxData): Validated<string> {
    const existing = await this.repo.findConnectedMailboxCompanyWide(data.connectedAccountId);
    if (!existing) return failNotFound(CustomErrorCode.mailboxNotFound, ["connectedAccountId"]);

    await this.repo.deleteConnectedMailboxCompanyWide(data.connectedAccountId);

    return { ok: true as const, data: data.connectedAccountId };
  }
}
