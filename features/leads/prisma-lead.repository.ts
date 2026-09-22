import type { RepoArgs } from "@/core/utils/types";
import type { GetLeadByIdRepo } from "./get/get-lead-by-id.interactor";
import type { GetLeadsRepo } from "./get/get-leads.interactor";
import type { CreateLeadRepo } from "./upsert/create-lead.repo";
import type { UpdateLeadRepo } from "./upsert/update-lead.repo";
import type { DeleteLeadRepo } from "./delete/delete-lead.repo";

import { type LeadDto, type LeadListResponse } from "./lead.schema";

import { BaseRepository } from "@/core/base/base-repository";
import { Transaction } from "@/core/decorators/transaction.decorator";

export class PrismaLeadRepo
  extends BaseRepository
  implements GetLeadByIdRepo, GetLeadsRepo, CreateLeadRepo, UpdateLeadRepo, DeleteLeadRepo
{
  private get leadSelect() {
    return {
      id: true,
      title: true,
      status: true,
      sourceOrigin: true,
      labels: true,
      value: true,
      notes: true,
      convertedDealId: true,
      convertedAt: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
      contact: { select: { id: true, firstName: true, lastName: true } },
      organization: { select: { id: true, name: true } },
      owner: { select: { id: true, firstName: true, lastName: true, email: true } },
      source: { select: { id: true, name: true, slug: true } },
    };
  }

  async getLeadById(id: string): Promise<LeadDto | null> {
    return this.prisma.lead.findFirst({
      where: { ...this.accessWhere("lead"), id },
      select: this.leadSelect,
    });
  }

  async getLeads(args: RepoArgs<GetLeadsRepo, "getLeads">): Promise<LeadListResponse> {
    const where = {
      ...this.accessWhere("lead"),
      ...(args.status ? { status: args.status } : {}),
      ...(args.ownerUserId ? { ownerUserId: args.ownerUserId } : {}),
      ...(args.sourceId ? { sourceId: args.sourceId } : {}),
    };

    const [leads, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        select: this.leadSelect,
        orderBy: { createdAt: "desc" },
        skip: args.skip,
        take: args.take,
      }),
      this.prisma.lead.count({ where }),
    ]);

    return { leads, total };
  }

  async getOrThrowCompanyWide(id: string): Promise<LeadDto> {
    return this.prisma.lead.findFirstOrThrow({
      where: { companyId: this.companyId, id },
      select: this.leadSelect,
    });
  }

  @Transaction()
  async createLeadOrThrow(args: RepoArgs<CreateLeadRepo, "createLeadOrThrow">): Promise<LeadDto> {
    return this.prisma.lead.create({
      data: {
        companyId: this.companyId,
        title: args.title,
        status: args.status,
        sourceOrigin: args.sourceOrigin,
        sourceId: args.sourceId ?? null,
        contactId: args.contactId ?? null,
        organizationId: args.organizationId ?? null,
        ownerUserId: args.ownerUserId ?? null,
        labels: args.labels,
        value: args.value ?? null,
        notes: args.notes ?? undefined,
      },
      select: this.leadSelect,
    });
  }

  @Transaction()
  async updateLeadOrThrow(args: RepoArgs<UpdateLeadRepo, "updateLeadOrThrow">): Promise<LeadDto> {
    const { id, ...rest } = args;

    await this.prisma.lead.updateMany({
      where: { ...this.accessWhere("lead"), id },
      data: {
        ...(rest.title === undefined ? {} : { title: rest.title }),
        ...(rest.status === undefined ? {} : { status: rest.status }),
        ...(rest.sourceOrigin === undefined ? {} : { sourceOrigin: rest.sourceOrigin }),
        ...(rest.sourceId === undefined ? {} : { sourceId: rest.sourceId }),
        ...(rest.contactId === undefined ? {} : { contactId: rest.contactId }),
        ...(rest.organizationId === undefined ? {} : { organizationId: rest.organizationId }),
        ...(rest.ownerUserId === undefined ? {} : { ownerUserId: rest.ownerUserId }),
        ...(rest.labels === undefined ? {} : { labels: rest.labels }),
        ...(rest.value === undefined ? {} : { value: rest.value }),
        ...(rest.notes === undefined ? {} : { notes: rest.notes }),
      },
    });

    return this.getOrThrowCompanyWide(id);
  }

  @Transaction()
  async deleteLeadOrThrow(id: string): Promise<string> {
    await this.prisma.lead.deleteMany({ where: { ...this.accessWhere("lead"), id } });

    return id;
  }
}
