import type { Prisma } from "@/generated/prisma";
import type { RecordFileDto, RecordFileEntityType } from "./record-file.schema";
import type { CreateRecordFileUploadRepo } from "./upload/create-record-file-upload.repo";
import type { CompleteRecordFileUploadRepo, PendingRecordFile } from "./upload/complete-record-file-upload.repo";
import type { GetRecordFilesRepo } from "./get/get-record-files.repo";
import type { GetRecordFileDownloadRepo, StoredRecordFile } from "./get/get-record-file-download.repo";
import type { DeleteRecordFileRepo } from "./delete/delete-record-file.repo";
import type { SweepableRecordFile, SweepRecordFilesRepo } from "./sweep/sweep-record-files.repo";

import { RecordFileStatus } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";

const FILE_SELECT = {
  id: true,
  entityType: true,
  contactId: true,
  organizationId: true,
  dealId: true,
  leadId: true,
  storageKey: true,
  fileName: true,
  contentType: true,
  byteSize: true,
  createdAt: true,
  uploadedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.RecordFileSelect;

type FileRow = Prisma.RecordFileGetPayload<{ select: typeof FILE_SELECT }>;

const PARENT_KEY = {
  contact: "contactId",
  organization: "organizationId",
  deal: "dealId",
  lead: "leadId",
} as const satisfies Record<RecordFileEntityType, keyof Prisma.RecordFileWhereInput>;

function recordIdOf(row: FileRow): string {
  return row.contactId ?? row.organizationId ?? row.dealId ?? row.leadId ?? "";
}

function toDto(row: FileRow): RecordFileDto {
  return {
    id: row.id,
    entityType: row.entityType as RecordFileEntityType,
    recordId: recordIdOf(row),
    fileName: row.fileName,
    contentType: row.contentType,
    byteSize: row.byteSize,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt,
  };
}

function toStored(row: FileRow): StoredRecordFile {
  return {
    id: row.id,
    entityType: row.entityType as RecordFileEntityType,
    recordId: recordIdOf(row),
    storageKey: row.storageKey,
    fileName: row.fileName,
    contentType: row.contentType,
  };
}

export class PrismaRecordFileRepo
  extends BaseRepository
  implements
    CreateRecordFileUploadRepo,
    CompleteRecordFileUploadRepo,
    GetRecordFilesRepo,
    GetRecordFileDownloadRepo,
    DeleteRecordFileRepo,
    SweepRecordFilesRepo
{
  private parentWhere(entityType: RecordFileEntityType): Prisma.RecordFileWhereInput {
    if (entityType === "contact") return { entityType, contact: this.accessWhere("contact") };
    if (entityType === "organization") return { entityType, organization: this.accessWhere("organization") };
    if (entityType === "lead") return { entityType, lead: this.accessWhere("lead") };
    return { entityType, deal: this.accessWhere("deal") };
  }

  private readableWhere(): Prisma.RecordFileWhereInput {
    return {
      companyId: this.companyId,
      OR: [
        this.parentWhere("contact"),
        this.parentWhere("organization"),
        this.parentWhere("deal"),
        this.parentWhere("lead"),
      ],
    };
  }

  async isRecordAccessible(entityType: RecordFileEntityType, recordId: string): Promise<boolean> {
    if (entityType === "contact")
      return (await this.prisma.contact.count({ where: { id: recordId, ...this.accessWhere("contact") } })) > 0;
    if (entityType === "organization") {
      return (
        (await this.prisma.organization.count({ where: { id: recordId, ...this.accessWhere("organization") } })) > 0
      );
    }

    if (entityType === "lead")
      return (await this.prisma.lead.count({ where: { id: recordId, ...this.accessWhere("lead") } })) > 0;

    return (await this.prisma.deal.count({ where: { id: recordId, ...this.accessWhere("deal") } })) > 0;
  }

  async createPendingFile(args: {
    entityType: RecordFileEntityType;
    recordId: string;
    storageKey: string;
    fileName: string;
    contentType: string;
    byteSize: number;
  }): Promise<RecordFileDto> {
    const row = await this.prisma.recordFile.create({
      data: {
        companyId: this.companyId,
        entityType: args.entityType,
        [PARENT_KEY[args.entityType]]: args.recordId,
        storageKey: args.storageKey,
        fileName: args.fileName,
        contentType: args.contentType,
        byteSize: args.byteSize,
        uploadedByUserId: this.userId,
      },
      select: FILE_SELECT,
    });

    return toDto(row);
  }

  async findPendingFileOrNull(id: string): Promise<PendingRecordFile | null> {
    const row = await this.prisma.recordFile.findFirst({
      where: { id, status: RecordFileStatus.pending, ...this.readableWhere() },
      select: { ...FILE_SELECT, byteSize: true },
    });

    return row ? { ...toStored(row), byteSize: row.byteSize } : null;
  }

  async markFileReadyOrNull(id: string): Promise<RecordFileDto | null> {
    const updated = await this.prisma.recordFile.updateMany({
      where: { id, companyId: this.companyId, status: RecordFileStatus.pending },
      data: { status: RecordFileStatus.ready, completedAt: new Date() },
    });
    if (updated.count === 0) return null;

    const row = await this.prisma.recordFile.findFirst({
      where: { id, companyId: this.companyId },
      select: FILE_SELECT,
    });

    return row ? toDto(row) : null;
  }

  async deletePendingFile(id: string): Promise<void> {
    await this.prisma.recordFile.deleteMany({
      where: { id, companyId: this.companyId, status: RecordFileStatus.pending },
    });
  }

  async listReadyFiles(entityType: RecordFileEntityType, recordId: string): Promise<RecordFileDto[]> {
    const rows = await this.prisma.recordFile.findMany({
      where: {
        companyId: this.companyId,
        status: RecordFileStatus.ready,
        [PARENT_KEY[entityType]]: recordId,
        ...this.parentWhere(entityType),
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: FILE_SELECT,
    });

    return rows.map(toDto);
  }

  async findReadyFileOrNull(id: string): Promise<StoredRecordFile | null> {
    const row = await this.prisma.recordFile.findFirst({
      where: { id, status: RecordFileStatus.ready, ...this.readableWhere() },
      select: FILE_SELECT,
    });

    return row ? toStored(row) : null;
  }

  async findFileOrNull(id: string): Promise<StoredRecordFile | null> {
    const row = await this.prisma.recordFile.findFirst({ where: { id, ...this.readableWhere() }, select: FILE_SELECT });

    return row ? toStored(row) : null;
  }

  async deleteFile(id: string): Promise<boolean> {
    const deleted = await this.prisma.recordFile.deleteMany({ where: { id, companyId: this.companyId } });

    return deleted.count > 0;
  }

  @BypassTenantGuard
  async findSweepableFilesUnscoped(args: { pendingBefore: Date; limit: number }): Promise<SweepableRecordFile[]> {
    return await this.prisma.recordFile.findMany({
      where: {
        OR: [
          { status: RecordFileStatus.pending, createdAt: { lt: args.pendingBefore } },
          { contactId: null, organizationId: null, dealId: null, leadId: null },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: args.limit,
      select: { id: true, storageKey: true },
    });
  }

  @BypassTenantGuard
  async deleteFilesUnscoped(ids: readonly string[]): Promise<number> {
    if (ids.length === 0) return 0;

    const deleted = await this.prisma.recordFile.deleteMany({ where: { id: { in: [...ids] } } });

    return deleted.count;
  }
}
