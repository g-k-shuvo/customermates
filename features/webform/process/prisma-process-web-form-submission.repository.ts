import type { LeadDto } from "@/features/leads/lead.schema";
import type { Prisma } from "@/generated/prisma";
import type {
  CreateLeadFromSubmissionArgs,
  PendingSubmission,
  ProcessWebFormSubmissionRepo,
  ResolveContactArgs,
  ResolveOrganizationArgs,
} from "./process-web-form-submission.repo";

import type { WebFormCustomFieldValue } from "../ingest/web-form-custom-fields";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { CustomColumnType, DuplicateGroupStatus, EntityType, LeadStatus, MessagingProvider } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { plainTextToNotesDocument } from "@/components/editor/notes-document";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { channelClass } from "@/ee/messaging/provider";
import { WebFormFieldMappingSchema } from "../ingest/field-mapping";
import { toCustomColumnDto } from "@/features/custom-column/custom-column.dto";
import { contactMatchKeys } from "@/features/duplicates/match-keys";
import { reviewClusterFor } from "@/features/duplicates/duplicate-clusters";
import { concatNotes } from "@/features/duplicates/merge/merge-plan";
import { emailDomain, isFreeMailDomain } from "../ingest/free-mail-domains";

const OPEN_LEAD_STATUSES = [LeadStatus.new, LeadStatus.working, LeadStatus.qualified];
const REVIEW_CANDIDATE_LIMIT = 200;
const EMAIL_CLASS = "email";
const PHONE_CLASS = "phone";

const REVIEW_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  identifiers: { select: { channelClass: true, value: true } },
  organizations: { select: { organizationId: true } },
  customFieldValues: { where: { type: CustomColumnType.phone }, select: { value: true } },
} as const;

type ReviewRow = {
  id: string;
  firstName: string;
  lastName: string;
  identifiers: Array<{ channelClass: string; value: string }>;
  organizations: Array<{ organizationId: string }>;
  customFieldValues: Array<{ value: string | null }>;
};

function reviewKeys(row: ReviewRow) {
  return {
    id: row.id,
    keys: contactMatchKeys({
      firstName: row.firstName,
      lastName: row.lastName,
      emails: row.identifiers.filter((entry) => entry.channelClass === EMAIL_CLASS).map((entry) => entry.value),
      phones: [
        ...row.identifiers.filter((entry) => entry.channelClass === PHONE_CLASS).map((entry) => entry.value),
        ...row.customFieldValues.flatMap((entry) => (entry.value ?? "").split(",").map((phone) => phone.trim())),
      ].filter(Boolean),
      organizationIds: row.organizations.map((entry) => entry.organizationId),
    }),
  };
}

function customFieldRows(
  companyId: string,
  entity: { entityType: EntityType; field: "leadId" | "contactId"; id: string },
  values: readonly WebFormCustomFieldValue[],
  typeByColumnId: ReadonlyMap<string, CustomColumnType>,
): Prisma.CustomFieldValueCreateManyInput[] {
  return values.flatMap(({ columnId, value }) => {
    const type = typeByColumnId.get(columnId);
    if (!type) return [];

    return [
      {
        companyId,
        entityType: entity.entityType,
        [entity.field]: entity.id,
        columnId,
        value,
        type,
        numericValue: type === CustomColumnType.currency ? Number(value) : null,
      },
    ];
  });
}

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
        source: {
          select: { name: true, fieldMapping: true, defaultOwnerId: true, defaultLabels: true, dedupeLeads: true },
        },
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
      dedupeLeads: submission.source.dedupeLeads,
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
      where: { companyId: args.companyId, name: { equals: name, mode: "insensitive" } },
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
    const notes = args.message ? plainTextToNotesDocument(args.message) : null;
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
        value: args.value,
        notes: (notes ?? undefined) as Prisma.InputJsonValue | undefined,
      },
      select: { id: true },
    });

    if (args.customFieldValues.length > 0) {
      const columns = await this.prisma.customColumn.findMany({
        where: {
          companyId: args.companyId,
          entityType: EntityType.lead,
          id: { in: args.customFieldValues.map((entry) => entry.columnId) },
        },
        select: { id: true, type: true },
      });
      const data = customFieldRows(
        args.companyId,
        { entityType: EntityType.lead, field: "leadId", id: lead.id },
        args.customFieldValues,
        new Map(columns.map((column) => [column.id, column.type])),
      );
      if (data.length > 0) await this.prisma.customFieldValue.createMany({ data });
    }

    return lead.id;
  }

  @BypassTenantGuard
  async findMappableCustomColumnsUnscoped(companyId: string, columnIds: readonly string[]): Promise<CustomColumnDto[]> {
    if (columnIds.length === 0) return [];

    const rows = await this.prisma.customColumn.findMany({
      where: { companyId, id: { in: [...columnIds] }, entityType: { in: [EntityType.lead, EntityType.contact] } },
      select: { id: true, label: true, type: true, entityType: true, options: true },
    });

    return rows.map(toCustomColumnDto);
  }

  @BypassTenantGuard
  async fillEmptyContactCustomFieldsUnscoped(
    companyId: string,
    contactId: string,
    values: readonly WebFormCustomFieldValue[],
  ): Promise<void> {
    if (values.length === 0) return;

    const columnIds = values.map((entry) => entry.columnId);
    const [columns, filled] = await Promise.all([
      this.prisma.customColumn.findMany({
        where: { companyId, entityType: EntityType.contact, id: { in: columnIds } },
        select: { id: true, type: true },
      }),
      this.prisma.customFieldValue.findMany({
        where: { companyId, contactId, columnId: { in: columnIds }, value: { not: null } },
        select: { columnId: true },
      }),
    ]);
    const alreadySet = new Set(filled.map((row) => row.columnId));
    const data = customFieldRows(
      companyId,
      { entityType: EntityType.contact, field: "contactId", id: contactId },
      values.filter((entry) => !alreadySet.has(entry.columnId)),
      new Map(columns.map((column) => [column.id, column.type])),
    );

    if (data.length === 0) return;

    await this.prisma.customFieldValue.deleteMany({
      where: { companyId, contactId, columnId: { in: data.map((row) => row.columnId) } },
    });
    await this.prisma.customFieldValue.createMany({ data });
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
  async findLeadForEventOrThrowUnscoped(leadId: string): Promise<LeadDto> {
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

  @BypassTenantGuard
  async findTaskCapableUserIdUnscoped(companyId: string): Promise<string | null> {
    const user = await this.prisma.user.findFirst({
      where: {
        companyId,
        status: "active",
        role: {
          OR: [{ isSystemRole: true }, { permissions: { some: { resource: "tasks", action: "create" } } }],
        },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    return user?.id ?? null;
  }

  @BypassTenantGuard
  async findActiveCompanyUserIdUnscoped(companyId: string, userId: string): Promise<string | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId, status: "active" },
      select: { id: true },
    });

    return user?.id ?? null;
  }

  @BypassTenantGuard
  async findContactIdByEmailUnscoped(companyId: string, email: string): Promise<string | null> {
    const existing = await this.prisma.contactIdentifier.findFirst({
      where: { companyId, channelClass: EMAIL_CLASS, value: email.trim().toLowerCase() },
      select: { contactId: true },
    });

    return existing?.contactId ?? null;
  }

  @BypassTenantGuard
  async findOpenLeadForContactUnscoped(companyId: string, contactId: string): Promise<string | null> {
    const lead = await this.prisma.lead.findFirst({
      where: { companyId, contactId, status: { in: OPEN_LEAD_STATUSES } },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });

    return lead?.id ?? null;
  }

  @BypassTenantGuard
  async appendMessageToLeadUnscoped(companyId: string, leadId: string, message: string | null): Promise<void> {
    if (!message) return;

    const lead = await this.prisma.lead.findFirst({ where: { id: leadId, companyId }, select: { notes: true } });
    if (!lead) return;

    const notes = concatNotes([lead.notes, plainTextToNotesDocument(message)]);
    await this.prisma.lead.updateMany({
      where: { id: leadId, companyId },
      data: { notes: notes as Prisma.InputJsonValue },
    });
  }

  @BypassTenantGuard
  async openContactReviewUnscoped(companyId: string, contactId: string): Promise<void> {
    const captured = (await this.prisma.contact.findFirst({
      where: { id: contactId, companyId },
      select: REVIEW_SELECT,
    })) as ReviewRow | null;
    if (!captured) return;

    const domains = captured.identifiers
      .filter((entry) => entry.channelClass === EMAIL_CLASS)
      .flatMap((entry) => {
        const domain = emailDomain(entry.value);
        return domain && !isFreeMailDomain(domain) ? [domain] : [];
      });
    const lastName = captured.lastName.trim();
    const candidateWhere = [
      ...(lastName ? [{ lastName: { equals: lastName, mode: "insensitive" as const } }] : []),
      ...domains.map((domain) => ({
        identifiers: { some: { channelClass: EMAIL_CLASS, value: { endsWith: `@${domain}` } } },
      })),
    ];
    if (candidateWhere.length === 0) return;

    const candidates = (await this.prisma.contact.findMany({
      where: { companyId, id: { not: contactId }, OR: candidateWhere },
      select: REVIEW_SELECT,
      take: REVIEW_CANDIDATE_LIMIT,
    })) as ReviewRow[];

    const cluster = reviewClusterFor(contactId, [captured, ...candidates].map(reviewKeys));
    if (!cluster) return;

    const alreadyOpen = await this.prisma.duplicateGroup.findFirst({
      where: {
        companyId,
        entityType: EntityType.contact,
        status: DuplicateGroupStatus.open,
        members: { some: { contactId } },
      },
      select: { id: true },
    });
    if (alreadyOpen) return;

    await this.prisma.duplicateGroup.create({
      data: {
        companyId,
        entityType: EntityType.contact,
        fingerprint: cluster.fingerprint,
        score: cluster.score,
        signals: cluster.signals,
        members: { create: cluster.recordIds.map((recordId) => ({ companyId, contactId: recordId })) },
      },
    });
  }
}
