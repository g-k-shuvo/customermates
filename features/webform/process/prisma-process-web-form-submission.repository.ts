import type { LeadDto } from "@/features/leads/lead.schema";
import type { Prisma } from "@/generated/prisma";
import type {
  CreateLeadFromSubmissionArgs,
  PendingSubmission,
  ProcessWebFormSubmissionRepo,
  ResolveContactArgs,
  ResolveOrganizationArgs,
} from "./process-web-form-submission.repo";

import { MessagingProvider } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { channelClass } from "@/ee/messaging/provider";
import { WebFormFieldMappingSchema } from "../ingest/field-mapping";

export class PrismaProcessWebFormSubmissionRepo extends BaseRepository implements ProcessWebFormSubmissionRepo {
  @BypassTenantGuard
  async findPendingSubmissionUnscoped(submissionId: string): Promise<PendingSubmission | null> {
    const submission = await this.prisma.webFormSubmission.findFirst({
      where: { id: submissionId, leadId: null },
      select: {
        id: true,
        companyId: true,
        sourceId: true,
        rawPayload: true,
        source: { select: { name: true, fieldMapping: true, defaultOwnerId: true, defaultLabels: true } },
      },
    });

    if (!submission) return null;

    const mapping = WebFormFieldMappingSchema.safeParse(submission.source.fieldMapping);

    return {
      id: submission.id,
      companyId: submission.companyId,
      sourceId: submission.sourceId,
      rawPayload: submission.rawPayload,
      sourceName: submission.source.name,
      fieldMapping: mapping.success ? mapping.data : {},
      defaultOwnerId: submission.source.defaultOwnerId,
      defaultLabels: submission.source.defaultLabels,
    };
  }

  @BypassTenantGuard
  async resolveContactUnscoped(args: ResolveContactArgs): Promise<string | null> {
    const name = { firstName: args.firstName?.trim() || "", lastName: args.lastName?.trim() || "" };

    if (!args.email) {
      if (!name.firstName && !name.lastName) return null;

      const created = await this.prisma.contact.create({
        data: { companyId: args.companyId, firstName: name.firstName, lastName: name.lastName },
        select: { id: true },
      });

      return created.id;
    }

    const value = args.email.trim().toLowerCase();
    const existing = await this.prisma.contactIdentifier.findFirst({
      where: { companyId: args.companyId, channelClass: channelClass(MessagingProvider.mail), value },
      select: { contactId: true },
    });

    if (existing) return existing.contactId;

    const created = await this.prisma.contact.create({
      data: {
        companyId: args.companyId,
        firstName: name.firstName,
        lastName: name.lastName,
        identifiers: {
          create: [
            {
              companyId: args.companyId,
              provider: MessagingProvider.mail,
              channelClass: channelClass(MessagingProvider.mail),
              value,
            },
          ],
        },
      },
      select: { id: true },
    });

    return created.id;
  }

  @BypassTenantGuard
  async resolveOrganizationUnscoped(args: ResolveOrganizationArgs): Promise<string | null> {
    const name = args.name?.trim();
    if (!name) return null;

    const existing = await this.prisma.organization.findFirst({
      where: { companyId: args.companyId, name },
      select: { id: true },
    });

    if (existing) return existing.id;

    const created = await this.prisma.organization.create({
      data: { companyId: args.companyId, name },
      select: { id: true },
    });

    return created.id;
  }

  @BypassTenantGuard
  async createLeadFromSubmissionUnscoped(args: CreateLeadFromSubmissionArgs): Promise<string> {
    const lead = await this.prisma.lead.create({
      data: {
        companyId: args.companyId,
        sourceId: args.sourceId,
        sourceOrigin: "webform",
        title: args.title,
        contactId: args.contactId,
        organizationId: args.organizationId,
        ownerUserId: args.ownerUserId,
        labels: args.labels,
        notes: (args.message ? { message: args.message } : undefined) as Prisma.InputJsonValue | undefined,
      },
      select: { id: true },
    });

    return lead.id;
  }

  @BypassTenantGuard
  async markSubmissionProcessedUnscoped(submissionId: string, leadId: string): Promise<void> {
    await this.prisma.webFormSubmission.updateMany({
      where: { id: submissionId },
      data: { leadId, status: "processed", processedAt: new Date(), error: null },
    });
  }

  @BypassTenantGuard
  async markSubmissionFailedUnscoped(submissionId: string, error: string): Promise<void> {
    await this.prisma.webFormSubmission.updateMany({
      where: { id: submissionId },
      data: { status: "failed", error: error.slice(0, 2000) },
    });
  }

  @BypassTenantGuard
  async findLeadForEventUnscoped(leadId: string): Promise<LeadDto> {
    return this.prisma.lead.findFirstOrThrow({
      where: { id: leadId },
      select: {
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
        customFieldValues: { select: { columnId: true, value: true } },
      },
    });
  }
}
