import type { Data, Validated } from "@/core/validation/validation.utils";
import type { StorageProvider } from "@/core/storage/storage-provider";
import type { UserService } from "@/features/user/user.service";
import type { CreateRecordFileUploadRepo } from "./create-record-file-upload.repo";

import { z } from "zod";
import { Action } from "@/generated/prisma";

import {
  RECORD_FILE_NAME_MAX_LENGTH,
  type RecordFileUploadDto,
  RecordFileEntityTypeSchema,
  RecordFileUploadDtoSchema,
} from "../record-file.schema";
import {
  RECORD_FILE_RESOURCE,
  RECORD_FILE_WRITE_PERMISSIONS,
  RECORD_NOT_FOUND_CODE,
  storageFailure,
  UPLOAD_REFUSAL_CODE,
  UPLOAD_REFUSAL_PATH,
} from "../record-file-access";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { mintStorageKey } from "@/core/storage/storage-key";
import { checkUpload, UploadPolicyName } from "@/core/storage/upload-policy";
import { fail, failAuthorization, failNotFound, failUnavailable } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

export const CreateRecordFileUploadSchema = z.object({
  entityType: RecordFileEntityTypeSchema,
  recordId: z.uuid(),
  fileName: z.string().trim().min(1).max(RECORD_FILE_NAME_MAX_LENGTH),
  contentType: z.string().max(255),
  byteSize: z.number().int().positive(),
});

export type CreateRecordFileUploadData = Data<typeof CreateRecordFileUploadSchema>;

@TenantInteractor({ permissions: RECORD_FILE_WRITE_PERMISSIONS, condition: "OR" })
export class CreateRecordFileUploadInteractor extends AuthenticatedInteractor<
  CreateRecordFileUploadData,
  RecordFileUploadDto
> {
  constructor(
    private repo: CreateRecordFileUploadRepo,
    private storage: StorageProvider,
    private userService: UserService,
  ) {
    super();
  }

  @Write({ input: CreateRecordFileUploadSchema, output: RecordFileUploadDtoSchema })
  async invoke(data: CreateRecordFileUploadData): Validated<RecordFileUploadDto> {
    if (!this.userService.hasPermissionForUser(this.user, RECORD_FILE_RESOURCE[data.entityType], Action.update))
      return failAuthorization(CustomErrorCode.permissionDenied, ["entityType"]);

    if (!this.storage.configured) return failUnavailable(CustomErrorCode.fileStorageNotConfigured);

    if (!(await this.repo.isRecordAccessible(data.entityType, data.recordId)))
      return failNotFound(RECORD_NOT_FOUND_CODE[data.entityType], ["recordId"]);

    const checked = checkUpload({
      fileName: data.fileName,
      contentType: data.contentType,
      byteSize: data.byteSize,
      maxBytes: this.storage.maxUploadBytes,
      policy: UploadPolicyName.recordFile,
    });
    if (!checked.ok) return fail(UPLOAD_REFUSAL_CODE[checked.reason], [UPLOAD_REFUSAL_PATH[checked.reason]]);

    const storageKey = mintStorageKey({
      companyId: this.companyId,
      scope: "recordFile",
      recordId: data.recordId,
      extension: checked.extension,
    });

    try {
      const upload = await this.storage.presignUpload({
        key: storageKey,
        contentType: checked.contentType,
        byteSize: data.byteSize,
      });
      const file = await this.repo.createPendingFile({
        entityType: data.entityType,
        recordId: data.recordId,
        storageKey,
        fileName: data.fileName,
        contentType: checked.contentType,
        byteSize: data.byteSize,
      });

      return { ok: true as const, data: { file, upload } };
    } catch (error) {
      return storageFailure(error);
    }
  }
}
