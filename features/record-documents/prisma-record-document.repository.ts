import type { Prisma } from "@/generated/prisma";
import type { RecordDocumentEntityType } from "@/features/record-files/record-file.schema";
import type { RecordDocumentDto, RecordDocumentFileDto } from "./record-document.schema";
import type { GetRecordDocumentsRepo } from "./get/get-record-documents.repo";
import type { GetRecordDocumentDownloadRepo, StoredDocumentPdfs } from "./get/get-record-document-download.repo";
import type { CreateRecordDocumentRepo } from "./upload/create-record-document.repo";
import type { CreateSignedCopyUploadRepo } from "./upload/create-signed-copy-upload.repo";
import type {
  CompleteRecordDocumentFileRepo,
  PendingRecordDocumentFile,
  SupersededRecordDocumentFile,
} from "./upload/complete-record-document-file.repo";
import type { UpdateRecordDocumentRepo } from "./update/update-record-document.repo";
import type { DeletableRecordDocument, DeleteRecordDocumentRepo } from "./delete/delete-record-document.repo";
import type { SweepableRecordDocumentFile, SweepRecordDocumentsRepo } from "./sweep/sweep-record-documents.repo";
import type { SigningRecipientState } from "@/core/signing/signing-provider";
import type {
  EnvelopeRecordDocument,
  GetSignatureSuggestionsRepo,
  RecordDocumentSigningRepo,
  SignableRecordDocument,
  SignRecordDocumentRepo,
} from "./signing/record-document-signing.repo";

import { z } from "zod";
import {
  RecordDocumentEnvelopeStatus,
  RecordDocumentFileKind,
  RecordDocumentFileStatus,
  RecordDocumentSigningProvider,
  RecordDocumentStatus,
} from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";

const USER_SELECT = { id: true, firstName: true, lastName: true } as const;

const FILE_SELECT = {
  id: true,
  kind: true,
  fileName: true,
  byteSize: true,
  createdAt: true,
  uploadedBy: { select: USER_SELECT },
} satisfies Prisma.RecordDocumentFileSelect;

const DOCUMENT_SELECT = {
  id: true,
  entityType: true,
  contactId: true,
  organizationId: true,
  dealId: true,
  title: true,
  status: true,
  statusChangedAt: true,
  createdAt: true,
  updatedAt: true,
  signingProvider: true,
  envelopeStatus: true,
  envelopeSentAt: true,
  envelopeRecipients: true,
  createdBy: { select: USER_SELECT },
  files: {
    where: { status: RecordDocumentFileStatus.ready },
    orderBy: [{ completedAt: "desc" }, { id: "asc" }],
    select: { ...FILE_SELECT, storageKey: true },
  },
} satisfies Prisma.RecordDocumentSelect;

type DocumentRow = Prisma.RecordDocumentGetPayload<{ select: typeof DOCUMENT_SELECT }>;

type FileRow = Prisma.RecordDocumentFileGetPayload<{ select: typeof FILE_SELECT }>;

const PARENT_KEY = {
  contact: "contactId",
  organization: "organizationId",
  deal: "dealId",
} as const satisfies Record<RecordDocumentEntityType, keyof Prisma.RecordDocumentWhereInput>;

const LISTED: Prisma.RecordDocumentWhereInput = {
  files: { some: { kind: RecordDocumentFileKind.original, status: RecordDocumentFileStatus.ready } },
};

const StoredRecipientsSchema = z.array(
  z.object({ name: z.string(), email: z.string(), status: z.string(), completedAt: z.string().nullable() }),
);

function recipientsFrom(value: Prisma.JsonValue | null): SigningRecipientState[] {
  const parsed = StoredRecipientsSchema.safeParse(value);
  if (!parsed.success) return [];

  return parsed.data.map((recipient) => ({
    ...recipient,
    completedAt: recipient.completedAt ? new Date(recipient.completedAt) : null,
  }));
}

function recipientsJson(recipients: readonly SigningRecipientState[]): Prisma.InputJsonValue {
  return recipients.map((recipient) => ({
    name: recipient.name,
    email: recipient.email,
    status: recipient.status,
    completedAt: recipient.completedAt ? new Date(recipient.completedAt).toISOString() : null,
  }));
}

function recordIdOf(row: { contactId: string | null; organizationId: string | null; dealId: string | null }) {
  return row.contactId ?? row.organizationId ?? row.dealId ?? null;
}

function fileDto(row: FileRow): RecordDocumentFileDto {
  return {
    id: row.id,
    kind: row.kind,
    fileName: row.fileName,
    byteSize: row.byteSize,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt,
  };
}

function documentDto(row: DocumentRow): RecordDocumentDto {
  const original = row.files.find((file) => file.kind === RecordDocumentFileKind.original);
  const signed = row.files.find((file) => file.kind === RecordDocumentFileKind.signed);

  return {
    id: row.id,
    entityType: row.entityType as RecordDocumentEntityType,
    recordId: row.contactId ?? row.organizationId ?? row.dealId ?? "",
    title: row.title,
    status: row.status,
    statusChangedAt: row.statusChangedAt,
    original: original ? fileDto(original) : null,
    signed: signed ? fileDto(signed) : null,
    signature:
      row.signingProvider && row.envelopeStatus && row.envelopeSentAt
        ? {
            provider: row.signingProvider,
            status: row.envelopeStatus,
            sentAt: row.envelopeSentAt,
            recipients: recipientsFrom(row.envelopeRecipients),
          }
        : null,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PrismaRecordDocumentRepo
  extends BaseRepository
  implements
    GetRecordDocumentsRepo,
    GetRecordDocumentDownloadRepo,
    CreateRecordDocumentRepo,
    CreateSignedCopyUploadRepo,
    CompleteRecordDocumentFileRepo,
    UpdateRecordDocumentRepo,
    DeleteRecordDocumentRepo,
    SweepRecordDocumentsRepo,
    RecordDocumentSigningRepo,
    SignRecordDocumentRepo,
    GetSignatureSuggestionsRepo
{
  private parentWhere(entityType: RecordDocumentEntityType): Prisma.RecordDocumentWhereInput {
    if (entityType === "contact") return { entityType, contact: this.accessWhere("contact") };
    if (entityType === "organization") return { entityType, organization: this.accessWhere("organization") };
    return { entityType, deal: this.accessWhere("deal") };
  }

  private readableWhere(): Prisma.RecordDocumentWhereInput {
    return {
      companyId: this.companyId,
      OR: [this.parentWhere("contact"), this.parentWhere("organization"), this.parentWhere("deal")],
    };
  }

  private async documentOrNull(id: string): Promise<RecordDocumentDto | null> {
    const row = await this.prisma.recordDocument.findFirst({
      where: { id, ...LISTED, ...this.readableWhere() },
      select: DOCUMENT_SELECT,
    });

    return row ? documentDto(row) : null;
  }

  async isRecordAccessible(entityType: RecordDocumentEntityType, recordId: string): Promise<boolean> {
    if (entityType === "contact")
      return (await this.prisma.contact.count({ where: { id: recordId, ...this.accessWhere("contact") } })) > 0;
    if (entityType === "organization") {
      return (
        (await this.prisma.organization.count({ where: { id: recordId, ...this.accessWhere("organization") } })) > 0
      );
    }

    return (await this.prisma.deal.count({ where: { id: recordId, ...this.accessWhere("deal") } })) > 0;
  }

  async listDocuments(entityType: RecordDocumentEntityType, recordId: string): Promise<RecordDocumentDto[]> {
    const rows = await this.prisma.recordDocument.findMany({
      where: {
        companyId: this.companyId,
        [PARENT_KEY[entityType]]: recordId,
        ...LISTED,
        ...this.parentWhere(entityType),
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: DOCUMENT_SELECT,
    });

    return rows.map(documentDto);
  }

  async findListedDocumentOrNull(id: string): Promise<RecordDocumentDto | null> {
    return await this.documentOrNull(id);
  }

  async findListedDocumentPdfsOrNull(id: string): Promise<StoredDocumentPdfs | null> {
    const row = await this.prisma.recordDocument.findFirst({
      where: { id, ...LISTED, ...this.readableWhere() },
      select: DOCUMENT_SELECT,
    });
    if (!row) return null;

    const pdf = (kind: RecordDocumentFileKind) => {
      const file = row.files.find((candidate) => candidate.kind === kind);
      return file ? { storageKey: file.storageKey, fileName: file.fileName } : null;
    };
    const original = pdf(RecordDocumentFileKind.original);

    return original ? { original, signed: pdf(RecordDocumentFileKind.signed) } : null;
  }

  async createDocumentWithPendingOriginal(args: {
    entityType: RecordDocumentEntityType;
    recordId: string;
    title: string;
    status: RecordDocumentStatus;
    storageKey: string;
    fileName: string;
    byteSize: number;
  }): Promise<{ document: RecordDocumentDto; file: RecordDocumentFileDto }> {
    const document = await this.prisma.recordDocument.create({
      data: {
        companyId: this.companyId,
        entityType: args.entityType,
        [PARENT_KEY[args.entityType]]: args.recordId,
        title: args.title,
        status: args.status,
        createdByUserId: this.userId,
      },
      select: DOCUMENT_SELECT,
    });
    const file = await this.prisma.recordDocumentFile.create({
      data: {
        companyId: this.companyId,
        documentId: document.id,
        kind: RecordDocumentFileKind.original,
        storageKey: args.storageKey,
        fileName: args.fileName,
        byteSize: args.byteSize,
        uploadedByUserId: this.userId,
      },
      select: FILE_SELECT,
    });

    return { document: documentDto(document), file: fileDto(file) };
  }

  async createPendingSignedFile(args: {
    documentId: string;
    storageKey: string;
    fileName: string;
    byteSize: number;
  }): Promise<RecordDocumentFileDto> {
    const file = await this.prisma.recordDocumentFile.create({
      data: {
        companyId: this.companyId,
        documentId: args.documentId,
        kind: RecordDocumentFileKind.signed,
        storageKey: args.storageKey,
        fileName: args.fileName,
        byteSize: args.byteSize,
        uploadedByUserId: this.userId,
      },
      select: FILE_SELECT,
    });

    return fileDto(file);
  }

  async findPendingFileOrNull(documentId: string, fileId: string): Promise<PendingRecordDocumentFile | null> {
    const row = await this.prisma.recordDocumentFile.findFirst({
      where: {
        id: fileId,
        documentId,
        companyId: this.companyId,
        status: RecordDocumentFileStatus.pending,
        document: this.readableWhere(),
      },
      select: {
        id: true,
        documentId: true,
        kind: true,
        storageKey: true,
        byteSize: true,
        document: { select: { entityType: true } },
      },
    });
    if (!row) return null;

    return {
      id: row.id,
      documentId: row.documentId,
      entityType: row.document.entityType as RecordDocumentEntityType,
      kind: row.kind,
      storageKey: row.storageKey,
      byteSize: row.byteSize,
    };
  }

  async findSupersededSignedFiles(documentId: string, fileId: string): Promise<SupersededRecordDocumentFile[]> {
    return await this.prisma.recordDocumentFile.findMany({
      where: {
        documentId,
        companyId: this.companyId,
        kind: RecordDocumentFileKind.signed,
        status: RecordDocumentFileStatus.ready,
        id: { not: fileId },
      },
      select: { id: true, storageKey: true },
    });
  }

  async discardPendingFile(file: PendingRecordDocumentFile): Promise<void> {
    if (file.kind === RecordDocumentFileKind.original) {
      await this.prisma.recordDocument.deleteMany({
        where: { id: file.documentId, companyId: this.companyId, NOT: LISTED },
      });
      return;
    }

    await this.prisma.recordDocumentFile.deleteMany({
      where: { id: file.id, companyId: this.companyId, status: RecordDocumentFileStatus.pending },
    });
  }

  async markFileReadyOrNull(
    file: PendingRecordDocumentFile,
    superseded: readonly SupersededRecordDocumentFile[],
  ): Promise<RecordDocumentDto | null> {
    const completed = await this.withCompanyTransaction(this.companyId, async () => {
      const now = new Date();
      const marked = await this.prisma.recordDocumentFile.updateMany({
        where: { id: file.id, companyId: this.companyId, status: RecordDocumentFileStatus.pending },
        data: { status: RecordDocumentFileStatus.ready, completedAt: now },
      });
      if (marked.count === 0) return false;

      if (superseded.length > 0) {
        await this.prisma.recordDocumentFile.deleteMany({
          where: {
            id: { in: superseded.map((entry) => entry.id) },
            documentId: file.documentId,
            companyId: this.companyId,
          },
        });
      }

      if (file.kind === RecordDocumentFileKind.signed) {
        await this.prisma.recordDocument.updateMany({
          where: { id: file.documentId, companyId: this.companyId, status: { not: RecordDocumentStatus.completed } },
          data: { status: RecordDocumentStatus.completed, statusChangedAt: now },
        });
      }

      return true;
    });

    return completed ? await this.documentOrNull(file.documentId) : null;
  }

  async updateDocumentOrNull(
    id: string,
    changes: { title?: string; status?: RecordDocumentStatus },
  ): Promise<RecordDocumentDto | null> {
    const current = await this.prisma.recordDocument.findFirst({
      where: { id, ...LISTED, ...this.readableWhere() },
      select: { status: true },
    });
    if (!current) return null;

    const statusChanged = changes.status !== undefined && changes.status !== current.status;
    await this.prisma.recordDocument.updateMany({
      where: { id, companyId: this.companyId },
      data: {
        ...(changes.title !== undefined ? { title: changes.title } : {}),
        ...(statusChanged ? { status: changes.status, statusChangedAt: new Date() } : {}),
      },
    });

    return await this.documentOrNull(id);
  }

  async findDocumentOrNull(id: string): Promise<DeletableRecordDocument | null> {
    const row = await this.prisma.recordDocument.findFirst({
      where: { id, ...this.readableWhere() },
      select: { id: true, entityType: true, title: true, files: { select: { storageKey: true } } },
    });
    if (!row) return null;

    return {
      id: row.id,
      entityType: row.entityType as RecordDocumentEntityType,
      title: row.title,
      storageKeys: row.files.map((entry) => entry.storageKey),
    };
  }

  async deleteDocument(id: string): Promise<boolean> {
    const deleted = await this.prisma.recordDocument.deleteMany({ where: { id, companyId: this.companyId } });

    return deleted.count > 0;
  }

  @BypassTenantGuard
  async findSweepableDocumentFilesUnscoped(args: {
    pendingBefore: Date;
    limit: number;
  }): Promise<SweepableRecordDocumentFile[]> {
    return await this.prisma.recordDocumentFile.findMany({
      where: {
        OR: [
          { status: RecordDocumentFileStatus.pending, createdAt: { lt: args.pendingBefore } },
          { document: { contactId: null, organizationId: null, dealId: null } },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: args.limit,
      select: { id: true, storageKey: true },
    });
  }

  @BypassTenantGuard
  async deleteDocumentFilesUnscoped(ids: readonly string[]): Promise<number> {
    if (ids.length === 0) return 0;

    const deleted = await this.prisma.recordDocumentFile.deleteMany({ where: { id: { in: [...ids] } } });

    return deleted.count;
  }

  @BypassTenantGuard
  async deleteEmptyDocumentsUnscoped(args: { createdBefore: Date; limit: number }): Promise<number> {
    const empty = await this.prisma.recordDocument.findMany({
      where: {
        files: { none: {} },
        OR: [{ createdAt: { lt: args.createdBefore } }, { contactId: null, organizationId: null, dealId: null }],
      },
      orderBy: { createdAt: "asc" },
      take: args.limit,
      select: { id: true },
    });
    if (empty.length === 0) return 0;

    const deleted = await this.prisma.recordDocument.deleteMany({
      where: { id: { in: empty.map((row) => row.id) }, files: { none: {} } },
    });

    return deleted.count;
  }

  async findSignableDocumentOrNull(id: string): Promise<SignableRecordDocument | null> {
    const row = await this.prisma.recordDocument.findFirst({
      where: { id, ...LISTED, ...this.readableWhere() },
      select: {
        ...DOCUMENT_SELECT,
        envelopeId: true,
        createdBy: { select: { ...USER_SELECT, email: true, displayLanguage: true } },
      },
    });
    const original = row?.files.find((file) => file.kind === RecordDocumentFileKind.original);
    const recordId = row ? recordIdOf(row) : null;
    if (!row || !original || !recordId) return null;

    return {
      id: row.id,
      entityType: row.entityType as RecordDocumentEntityType,
      recordId,
      title: row.title,
      status: row.status,
      envelopeId: row.envelopeId,
      envelopeStatus: row.envelopeStatus,
      recipients: recipientsFrom(row.envelopeRecipients),
      creator: row.createdBy ? { email: row.createdBy.email, displayLanguage: row.createdBy.displayLanguage } : null,
      original: { storageKey: original.storageKey, fileName: original.fileName },
    };
  }

  async recordEnvelopeSentOrNull(
    id: string,
    args: { envelopeId: string; recipients: readonly SigningRecipientState[]; sentAt: Date },
  ): Promise<RecordDocumentDto | null> {
    const updated = await this.prisma.recordDocument.updateMany({
      where: { id, companyId: this.companyId },
      data: {
        signingProvider: RecordDocumentSigningProvider.docusign,
        envelopeId: args.envelopeId,
        envelopeStatus: RecordDocumentEnvelopeStatus.sent,
        envelopeSentAt: args.sentAt,
        envelopeRecipients: recipientsJson(args.recipients),
        status: RecordDocumentStatus.sent,
        statusChangedAt: args.sentAt,
      },
    });
    if (updated.count === 0) return null;

    return await this.documentOrNull(id);
  }

  async suggestSignatureRecipients(
    entityType: RecordDocumentEntityType,
    recordId: string,
    limit: number,
  ): Promise<{ name: string; email: string }[]> {
    const belongsToRecord: Prisma.ContactWhereInput =
      entityType === "contact"
        ? { id: recordId }
        : entityType === "deal"
          ? { deals: { some: { dealId: recordId } } }
          : { organizations: { some: { organizationId: recordId } } };
    const contacts = await this.prisma.contact.findMany({
      where: {
        companyId: this.companyId,
        AND: [belongsToRecord, this.accessWhere("contact")],
        identifiers: { some: { channelClass: "email" } },
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { id: "asc" }],
      take: limit,
      select: {
        firstName: true,
        lastName: true,
        identifiers: {
          where: { channelClass: "email" },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: 1,
          select: { value: true },
        },
      },
    });

    return contacts.flatMap((contact) => {
      const email = contact.identifiers[0]?.value;
      return email ? [{ name: `${contact.firstName} ${contact.lastName}`.trim(), email }] : [];
    });
  }

  @BypassTenantGuard
  async findDocumentByEnvelopeUnscoped(envelopeId: string): Promise<EnvelopeRecordDocument | null> {
    const row = await this.prisma.recordDocument.findFirst({
      where: { envelopeId },
      select: {
        id: true,
        companyId: true,
        entityType: true,
        contactId: true,
        organizationId: true,
        dealId: true,
        title: true,
        status: true,
        envelopeId: true,
        envelopeStatus: true,
        envelopeRecipients: true,
        createdBy: { select: { email: true, displayLanguage: true } },
      },
    });
    const recordId = row ? recordIdOf(row) : null;
    if (!row?.envelopeId || !recordId) return null;

    return {
      id: row.id,
      companyId: row.companyId,
      entityType: row.entityType as RecordDocumentEntityType,
      recordId,
      title: row.title,
      status: row.status,
      envelopeId: row.envelopeId,
      envelopeStatus: row.envelopeStatus,
      recipients: recipientsFrom(row.envelopeRecipients),
      creator: row.createdBy,
    };
  }

  @BypassTenantGuard
  async attachEnvelopeCopyUnscoped(args: {
    companyId: string;
    documentId: string;
    storageKey: string;
    fileName: string;
    byteSize: number;
  }): Promise<SupersededRecordDocumentFile[]> {
    return await this.withCompanyTransaction(args.companyId, async () => {
      const superseded = await this.prisma.recordDocumentFile.findMany({
        where: {
          documentId: args.documentId,
          companyId: args.companyId,
          kind: RecordDocumentFileKind.signed,
          status: RecordDocumentFileStatus.ready,
        },
        select: { id: true, storageKey: true },
      });
      await this.prisma.recordDocumentFile.create({
        data: {
          companyId: args.companyId,
          documentId: args.documentId,
          kind: RecordDocumentFileKind.signed,
          storageKey: args.storageKey,
          fileName: args.fileName,
          byteSize: args.byteSize,
          status: RecordDocumentFileStatus.ready,
          completedAt: new Date(),
        },
      });
      if (superseded.length > 0) {
        await this.prisma.recordDocumentFile.deleteMany({
          where: { id: { in: superseded.map((file) => file.id) }, companyId: args.companyId },
        });
      }

      return superseded;
    });
  }

  @BypassTenantGuard
  async recordEnvelopeStateUnscoped(args: {
    companyId: string;
    documentId: string;
    envelopeStatus: RecordDocumentEnvelopeStatus | null;
    status: RecordDocumentStatus;
    recipients: readonly SigningRecipientState[];
  }): Promise<{ completedNow: boolean }> {
    return await this.withCompanyTransaction(args.companyId, async () => {
      const current = await this.prisma.recordDocument.findFirst({
        where: { id: args.documentId, companyId: args.companyId },
        select: { status: true, envelopeStatus: true },
      });
      if (!current) return { completedNow: false };

      const completedNow =
        args.envelopeStatus === RecordDocumentEnvelopeStatus.completed &&
        current.envelopeStatus !== RecordDocumentEnvelopeStatus.completed;
      await this.prisma.recordDocument.updateMany({
        where: { id: args.documentId, companyId: args.companyId },
        data: {
          envelopeStatus: args.envelopeStatus,
          envelopeRecipients: recipientsJson(args.recipients),
          ...(args.status !== current.status ? { status: args.status, statusChangedAt: new Date() } : {}),
        },
      });

      return { completedNow };
    });
  }
}
