import type { Data, Validated } from "@/core/validation/validation.utils";
import type { StorageProvider } from "@/core/storage/storage-provider";
import type { StorageQuota } from "@/core/storage/storage-quota";
import type { UserService } from "@/features/user/user.service";
import type { CreateRecordDocumentRepo } from "./create-record-document.repo";

import { z } from "zod";
import { Action, RecordDocumentStatus } from "@/generated/prisma";

import {
  RECORD_DOCUMENT_TITLE_MAX_LENGTH,
  type RecordDocumentUploadDto,
  RecordDocumentPdfSchema,
  RecordDocumentStatusSchema,
  RecordDocumentUploadDtoSchema,
} from "../record-document.schema";
import { checkDocumentPdf, documentPdfRefusal, titleFromFileName } from "../record-document-access";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { mintStorageKey } from "@/core/storage/storage-key";
import {
  failAuthorization,
  failConflict,
  failNotFound,
  failUnavailable,
} from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordDocumentEntityTypeSchema } from "@/features/record-files/record-file.schema";
import {
  RECORD_FILE_RESOURCE,
  RECORD_FILE_WRITE_PERMISSIONS,
  RECORD_NOT_FOUND_CODE,
  storageFailure,
} from "@/features/record-files/record-file-access";

export const CreateRecordDocumentSchema = RecordDocumentPdfSchema.extend({
  entityType: RecordDocumentEntityTypeSchema,
  recordId: z.uuid(),
  title: z.string().trim().min(1).max(RECORD_DOCUMENT_TITLE_MAX_LENGTH).optional(),
  status: RecordDocumentStatusSchema.optional(),
});

export type CreateRecordDocumentData = Data<typeof CreateRecordDocumentSchema>;

@TenantInteractor({ permissions: RECORD_FILE_WRITE_PERMISSIONS, condition: "OR" })
export class CreateRecordDocumentInteractor extends AuthenticatedInteractor<
  CreateRecordDocumentData,
  RecordDocumentUploadDto
> {
  constructor(
    private repo: CreateRecordDocumentRepo,
    private storage: StorageProvider,
    private userService: UserService,
    private quota: StorageQuota,
  ) {
    super();
  }

  @Write({ input: CreateRecordDocumentSchema, output: RecordDocumentUploadDtoSchema })
  async invoke(data: CreateRecordDocumentData): Validated<RecordDocumentUploadDto> {
    if (!this.userService.hasPermissionForUser(this.user, RECORD_FILE_RESOURCE[data.entityType], Action.update))
      return failAuthorization(CustomErrorCode.permissionDenied, ["entityType"]);

    if (!this.storage.configured) return failUnavailable(CustomErrorCode.fileStorageNotConfigured);

    if (!(await this.repo.isRecordAccessible(data.entityType, data.recordId)))
      return failNotFound(RECORD_NOT_FOUND_CODE[data.entityType], ["recordId"]);

    const checked = checkDocumentPdf({
      fileName: data.fileName,
      contentType: data.contentType,
      byteSize: data.byteSize,
      maxBytes: this.storage.maxUploadBytes,
    });
    if (!checked.ok) return documentPdfRefusal(checked);

    if (!(await this.quota.allows(data.byteSize)))
      return failConflict(CustomErrorCode.storageQuotaExceeded, ["byteSize"]);

    const storageKey = mintStorageKey({
      companyId: this.companyId,
      scope: "document",
      recordId: data.recordId,
      extension: checked.extension,
    });

    try {
      const upload = await this.storage.presignUpload({
        key: storageKey,
        contentType: checked.contentType,
        byteSize: data.byteSize,
      });
      const created = await this.repo.createDocumentWithPendingOriginal({
        entityType: data.entityType,
        recordId: data.recordId,
        title: data.title ?? titleFromFileName(data.fileName),
        status: data.status ?? RecordDocumentStatus.draft,
        storageKey,
        fileName: data.fileName,
        byteSize: data.byteSize,
      });

      return { ok: true as const, data: { ...created, upload } };
    } catch (error) {
      return storageFailure(error);
    }
  }
}
