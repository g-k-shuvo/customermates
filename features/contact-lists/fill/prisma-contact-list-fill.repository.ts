import type { BulkJobHandler, BulkJobPage } from "@/features/bulk-job/bulk-job-handler";
import type { RunningBulkJob } from "@/features/bulk-job/bulk-job.repo";
import type { ContactListRepo } from "../contact-list.repo";
import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { Prisma } from "@/generated/prisma";

import { BulkJobKind } from "@/generated/prisma";

import { ContactListFillDefinitionSchema } from "../contact-list.schema";

import { BaseRepository } from "@/core/base/base-repository";

export type ContactFilterScope = {
  contactWhereFor(params: GetQueryParams): Promise<Prisma.ContactWhereInput>;
};

export class PrismaContactListFillRepo extends BaseRepository implements BulkJobHandler {
  readonly kind = BulkJobKind.contactListFill;

  constructor(
    private scope: ContactFilterScope,
    private lists: ContactListRepo,
  ) {
    super();
  }

  private async whereFor(job: RunningBulkJob): Promise<Prisma.ContactWhereInput> {
    const definition = ContactListFillDefinitionSchema.parse(job.definition);

    return await this.scope.contactWhereFor({
      filters: definition.filters,
      searchTerm: definition.searchTerm ?? undefined,
    });
  }

  async countTotal(job: RunningBulkJob): Promise<number> {
    return await this.prisma.contact.count({ where: await this.whereFor(job) });
  }

  async processPage(job: RunningBulkJob, cursor: string | null, take: number): Promise<BulkJobPage> {
    const where = await this.whereFor(job);
    const rows = await this.prisma.contact.findMany({
      where: { companyId: this.companyId, AND: [where, ...(cursor ? [{ id: { gt: cursor } }] : [])] },
      orderBy: { id: "asc" },
      take,
      select: { id: true },
    });
    const ids = rows.map((row) => row.id);
    await this.lists.addMembers(job.subjectId, ids, job.id);

    return { processed: ids.length, nextCursor: ids.length === take ? ids[ids.length - 1] : null };
  }

  finish(): Promise<void> {
    return Promise.resolve();
  }

  fail(): Promise<void> {
    return Promise.resolve();
  }
}
