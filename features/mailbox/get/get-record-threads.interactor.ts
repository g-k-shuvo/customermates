import type { Validated } from "@/core/validation/validation.utils";
import type { ThreadSummaryRow } from "./mailbox-thread-mapper";

import { Resource, Action } from "@/generated/prisma";

import { GetRecordThreadsSchema, MailboxThreadSummaryDtoSchema } from "../mailbox.schema";
import { type GetRecordThreadsData, type MailboxThreadSummaryDto } from "../mailbox.schema";
import { toThreadSummaryDto } from "./mailbox-thread-mapper";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Write } from "@/core/decorators/write.decorator";

export abstract class GetRecordThreadsRepo {
  abstract findContactIdsOnDeal(dealId: string): Promise<string[]>;
  abstract findEmailIdentifiersOfContacts(contactIds: readonly string[]): Promise<string[]>;
  abstract findThreadsForIdentifiers(identifiers: readonly string[], sharedOnly: boolean): Promise<ThreadSummaryRow[]>;
}

@TenantInteractor({
  permissions: [
    { resource: Resource.inboxMessages, action: Action.readAll },
    { resource: Resource.inboxMessages, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetRecordThreadsInteractor extends AuthenticatedInteractor<
  GetRecordThreadsData,
  MailboxThreadSummaryDto[]
> {
  constructor(private repo: GetRecordThreadsRepo) {
    super();
  }

  @Write({
    input: GetRecordThreadsSchema,
    output: MailboxThreadSummaryDtoSchema,
  })
  async invoke(data: GetRecordThreadsData): Validated<MailboxThreadSummaryDto[]> {
    const contactIds = data.dealId
      ? await this.repo.findContactIdsOnDeal(data.dealId)
      : data.contactId
        ? [data.contactId]
        : [];

    if (contactIds.length === 0) return { ok: true as const, data: [] };

    const identifiers = await this.repo.findEmailIdentifiersOfContacts(contactIds);
    const threads = await this.repo.findThreadsForIdentifiers(identifiers, true);

    return { ok: true as const, data: threads.map(toThreadSummaryDto) };
  }
}
