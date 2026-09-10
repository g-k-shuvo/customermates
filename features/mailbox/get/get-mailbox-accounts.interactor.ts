import type { Validated } from "@/core/validation/validation.utils";

import { Resource, Action } from "@/generated/prisma";

import { MailboxAccountDtoSchema, type MailboxAccountDto } from "../mailbox.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export abstract class GetMailboxAccountsRepo {
  abstract listConnectedMailboxes(): Promise<MailboxAccountDto[]>;
}

@TenantInteractor({
  permissions: [
    { resource: Resource.inboxMessages, action: Action.readAll },
    { resource: Resource.inboxMessages, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetMailboxAccountsInteractor extends AuthenticatedInteractor<void, MailboxAccountDto[]> {
  constructor(private repo: GetMailboxAccountsRepo) {
    super();
  }

  @ValidateOutput(MailboxAccountDtoSchema)
  async invoke(): Validated<MailboxAccountDto[]> {
    return { ok: true as const, data: await this.repo.listConnectedMailboxes() };
  }
}
