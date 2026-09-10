import type { Validated } from "@/core/validation/validation.utils";

import { z } from "zod";

import { Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export abstract class GetMailboxFoldersRepo {
  abstract listStoredMailboxFolders(): Promise<string[]>;
}

@TenantInteractor({
  permissions: [
    { resource: Resource.inboxMessages, action: Action.readAll },
    { resource: Resource.inboxMessages, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetMailboxFoldersInteractor extends AuthenticatedInteractor<void, string[]> {
  constructor(private repo: GetMailboxFoldersRepo) {
    super();
  }

  @ValidateOutput(z.string())
  async invoke(): Validated<string[]> {
    return { ok: true as const, data: await this.repo.listStoredMailboxFolders() };
  }
}
