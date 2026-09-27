import type { Validated } from "@/core/validation/validation.utils";
import type { ValidateContactIdsInteractor } from "@/core/validation/validators/validate-contact-ids.interactor";
import type { ValidateDealIdsInteractor } from "@/core/validation/validators/validate-deal-ids.interactor";
import type { ValidateLeadIdsInteractor } from "@/core/validation/validators/validate-lead-ids.interactor";
import type { ValidateOrganizationIdsInteractor } from "@/core/validation/validators/validate-organization-ids.interactor";
import type { ThreadSummaryRow } from "./mailbox-thread-mapper";

import { Resource, Action } from "@/generated/prisma";

import { GetRecordThreadsSchema, MailboxThreadSummaryDtoSchema } from "../mailbox.schema";
import { type GetRecordThreadsData, type MailboxThreadSummaryDto } from "../mailbox.schema";
import { toThreadSummaryDto } from "./mailbox-thread-mapper";
import { organizationEmailDomains } from "./organization-email-domains";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Write } from "@/core/decorators/write.decorator";

export abstract class GetRecordThreadsRepo {
  abstract findContactIdsOnDeal(dealId: string): Promise<string[]>;
  abstract findContactIdsOfOrganization(organizationId: string): Promise<string[]>;
  abstract findDealIdsOfOrganization(organizationId: string): Promise<string[]>;
  abstract findContactIdOfLead(leadId: string): Promise<string | null>;
  abstract findEmailIdentifiersOfContacts(contactIds: readonly string[]): Promise<string[]>;
  abstract findSharedThreadsForIdentifiersCompanyWide(identifiers: readonly string[]): Promise<ThreadSummaryRow[]>;
  abstract findSharedThreadsForDomainsCompanyWide(domains: readonly string[]): Promise<ThreadSummaryRow[]>;
  abstract findThreadsLinkedToDealCompanyWide(dealId: string): Promise<ThreadSummaryRow[]>;
  abstract findThreadsLinkedToDealsCompanyWide(dealIds: readonly string[]): Promise<ThreadSummaryRow[]>;
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
  constructor(
    private repo: GetRecordThreadsRepo,
    private contactValidator: ValidateContactIdsInteractor,
    private organizationValidator: ValidateOrganizationIdsInteractor,
    private leadValidator: ValidateLeadIdsInteractor,
    private dealValidator: ValidateDealIdsInteractor,
  ) {
    super();
  }

  @Write({
    input: GetRecordThreadsSchema,
    output: MailboxThreadSummaryDtoSchema,
    precheck: async (self, data, ctx) => {
      await Promise.all([
        self.contactValidator.invoke([{ ids: data.contactId, path: ["contactId"] }], ctx),
        self.organizationValidator.invoke([{ ids: data.organizationId, path: ["organizationId"] }], ctx),
        self.leadValidator.invoke([{ ids: data.leadId, path: ["leadId"] }], ctx),
        self.dealValidator.invoke([{ ids: data.dealId, path: ["dealId"] }], ctx),
      ]);
    },
  })
  async invoke(data: GetRecordThreadsData): Validated<MailboxThreadSummaryDto[]> {
    const organizationDealIds = data.organizationId
      ? await this.repo.findDealIdsOfOrganization(data.organizationId)
      : [];
    const linked = data.dealId
      ? await this.repo.findThreadsLinkedToDealCompanyWide(data.dealId)
      : organizationDealIds.length > 0
        ? await this.repo.findThreadsLinkedToDealsCompanyWide(organizationDealIds)
        : [];

    const contactIds = await this.contactIdsFor(data);
    const identifiers = contactIds.length > 0 ? await this.repo.findEmailIdentifiersOfContacts(contactIds) : [];
    const matched =
      identifiers.length > 0 ? await this.repo.findSharedThreadsForIdentifiersCompanyWide(identifiers) : [];

    const domains = data.organizationId ? organizationEmailDomains(identifiers) : [];
    const sameDomain = domains.length > 0 ? await this.repo.findSharedThreadsForDomainsCompanyWide(domains) : [];

    return { ok: true as const, data: newestFirst([...linked, ...matched, ...sameDomain]).map(toThreadSummaryDto) };
  }

  private async contactIdsFor(data: GetRecordThreadsData): Promise<string[]> {
    if (data.dealId) return await this.repo.findContactIdsOnDeal(data.dealId);
    if (data.contactId) return [data.contactId];
    if (data.organizationId) return await this.repo.findContactIdsOfOrganization(data.organizationId);
    if (data.leadId) {
      const contactId = await this.repo.findContactIdOfLead(data.leadId);
      return contactId ? [contactId] : [];
    }

    return [];
  }
}
