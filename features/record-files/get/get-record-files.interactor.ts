import type { Validated } from "@/core/validation/validation.utils";
import type { StorageProvider } from "@/core/storage/storage-provider";
import type { GetRecordFilesRepo } from "./get-record-files.repo";

import {
  type RecordFileListDto,
  type RecordFileTargetData,
  RecordFileListDtoSchema,
  RecordFileTargetSchema,
} from "../record-file.schema";
import { RECORD_FILE_READ_PERMISSIONS, RECORD_NOT_FOUND_CODE } from "../record-file-access";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { failNotFound } from "@/core/validation/interactor-failure-server";

@AllowInDemoMode
@TenantInteractor({ permissions: RECORD_FILE_READ_PERMISSIONS, condition: "OR" })
export class GetRecordFilesInteractor extends AuthenticatedInteractor<RecordFileTargetData, RecordFileListDto> {
  constructor(
    private repo: GetRecordFilesRepo,
    private storage: StorageProvider,
  ) {
    super();
  }

  @Validate(RecordFileTargetSchema)
  @ValidateOutput(RecordFileListDtoSchema)
  async invoke({ entityType, recordId }: RecordFileTargetData): Validated<RecordFileListDto> {
    if (!(await this.repo.isRecordAccessible(entityType, recordId)))
      return failNotFound(RECORD_NOT_FOUND_CODE[entityType], ["recordId"]);

    return {
      ok: true as const,
      data: {
        storageConfigured: this.storage.configured,
        maxUploadBytes: this.storage.maxUploadBytes,
        files: await this.repo.listReadyFiles(entityType, recordId),
      },
    };
  }
}
