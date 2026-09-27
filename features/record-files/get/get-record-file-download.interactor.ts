import type { Validated } from "@/core/validation/validation.utils";
import type { StorageProvider } from "@/core/storage/storage-provider";
import type { GetRecordFileDownloadRepo } from "./get-record-file-download.repo";

import {
  type RecordFileDownloadDto,
  type RecordFileIdData,
  RecordFileDownloadDtoSchema,
  RecordFileIdSchema,
} from "../record-file.schema";
import { RECORD_FILE_READ_PERMISSIONS, storageFailure } from "../record-file-access";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { dispositionFor, servedContentTypeFor } from "@/core/storage/upload-policy";
import { failNotFound, failUnavailable } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

@AllowInDemoMode
@TenantInteractor({ permissions: RECORD_FILE_READ_PERMISSIONS, condition: "OR" })
export class GetRecordFileDownloadInteractor extends AuthenticatedInteractor<RecordFileIdData, RecordFileDownloadDto> {
  constructor(
    private repo: GetRecordFileDownloadRepo,
    private storage: StorageProvider,
  ) {
    super();
  }

  @Validate(RecordFileIdSchema)
  @ValidateOutput(RecordFileDownloadDtoSchema)
  async invoke({ id }: RecordFileIdData): Validated<RecordFileDownloadDto> {
    const file = await this.repo.findReadyFileOrNull(id);
    if (!file) return failNotFound(CustomErrorCode.recordFileNotFound, ["id"]);

    if (!this.storage.configured) return failUnavailable(CustomErrorCode.fileStorageNotConfigured);

    const contentType = servedContentTypeFor(file.contentType);

    try {
      const link = await this.storage.presignDownload({
        key: file.storageKey,
        fileName: file.fileName,
        contentType,
        disposition: dispositionFor(contentType),
      });

      return { ok: true as const, data: link };
    } catch (error) {
      return storageFailure(error);
    }
  }
}
