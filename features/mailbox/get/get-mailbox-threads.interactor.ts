import type { Validated } from "@/core/validation/validation.utils";

import { Resource, Action } from "@/generated/prisma";

import { MailboxThreadSummaryDtoSchema, type MailboxThreadSummaryDto } from "../mailbox.schema";
import { toThreadSummaryDto, type ThreadSummaryRow } from "./mailbox-thread-mapper";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

const THREAD_PAGE_SIZE = 100;

export abstract class GetMailboxThreadsRepo {
  abstract listThreadsForMailboxes(limit: number): Promise<ThreadSummaryRow[]>;
}

@TenantInteractor({
  permissions: [
    { resource: Resource.inboxMessages, action: Action.readAll },
    { resource: Resource.inboxMessages, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetMailboxThreadsInteractor extends AuthenticatedInteractor<void, MailboxThreadSummaryDto[]> {
  constructor(private repo: GetMailboxThreadsRepo) {
    super();
  }

  @ValidateOutput(MailboxThreadSummaryDtoSchema)
  async invoke(): Validated<MailboxThreadSummaryDto[]> {
    const rows = await this.repo.listThreadsForMailboxes(THREAD_PAGE_SIZE);

    return { ok: true as const, data: rows.map(toThreadSummaryDto) };
  }
}
