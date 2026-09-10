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
  abstract findSharedThreadsForIdentifiersCompanyWide(identifiers: readonly string[]): Promise<ThreadSummaryRow[]>;
  abstract findThreadsLinkedToDealCompanyWide(dealId: string): Promise<ThreadSummaryRow[]>;
}

function newestFirst(rows: readonly ThreadSummaryRow[]): ThreadSummaryRow[] {
  const byId = new Map(rows.map((row) => [row.id, row]));

  return [...byId.values()].sort((left, right) => {
    const difference = (right.lastMessageAt?.getTime() ?? 0) - (left.lastMessageAt?.getTime() ?? 0);
    if (difference !== 0) return difference;

    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
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
    const linked = data.dealId ? await this.repo.findThreadsLinkedToDealCompanyWide(data.dealId) : [];

    const contactIds = data.dealId
      ? await this.repo.findContactIdsOnDeal(data.dealId)
      : data.contactId
        ? [data.contactId]
        : [];

    const identifiers = contactIds.length > 0 ? await this.repo.findEmailIdentifiersOfContacts(contactIds) : [];
    const matched =
      identifiers.length > 0 ? await this.repo.findSharedThreadsForIdentifiersCompanyWide(identifiers) : [];

    return { ok: true as const, data: newestFirst([...linked, ...matched]).map(toThreadSummaryDto) };
  }
}
