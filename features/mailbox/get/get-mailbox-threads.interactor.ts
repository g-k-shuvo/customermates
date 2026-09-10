import type { Validated } from "@/core/validation/validation.utils";
import type { MailboxThreadFilter } from "./mailbox-thread-filter";

import { Resource, Action } from "@/generated/prisma";

import { GetMailboxThreadsSchema, MailboxThreadSummaryDtoSchema } from "../mailbox.schema";
import { type GetMailboxThreadsData, type MailboxThreadSummaryDto } from "../mailbox.schema";
import { toMailboxThreadFilter } from "./mailbox-thread-filter";
import { toThreadSummaryDto, type ThreadSummaryRow } from "./mailbox-thread-mapper";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

const THREAD_PAGE_SIZE = 100;

export abstract class GetMailboxThreadsRepo {
  abstract listThreadsForMailboxes(limit: number, filter: MailboxThreadFilter): Promise<ThreadSummaryRow[]>;
}

@TenantInteractor({
  permissions: [
    { resource: Resource.inboxMessages, action: Action.readAll },
    { resource: Resource.inboxMessages, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetMailboxThreadsInteractor extends AuthenticatedInteractor<
  GetMailboxThreadsData,
  MailboxThreadSummaryDto[]
> {
  constructor(private repo: GetMailboxThreadsRepo) {
    super();
  }

  @Validate(GetMailboxThreadsSchema)
  @ValidateOutput(MailboxThreadSummaryDtoSchema)
  async invoke(data: GetMailboxThreadsData): Validated<MailboxThreadSummaryDto[]> {
    const rows = await this.repo.listThreadsForMailboxes(THREAD_PAGE_SIZE, toMailboxThreadFilter(data));

    return { ok: true as const, data: rows.map(toThreadSummaryDto) };
  }
}
