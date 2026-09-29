import type { Validated } from "@/core/validation/validation.utils";
import type { StorageProvider } from "@/core/storage/storage-provider";
import type { SigningProvider } from "@/core/signing/signing-provider";
import type { RecordDocumentTargetData } from "@/features/record-files/record-file.schema";
import type { GetRecordDocumentsRepo } from "./get-record-documents.repo";

import { type RecordDocumentListDto, RecordDocumentListDtoSchema } from "../record-document.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { RecordDocumentTargetSchema } from "@/features/record-files/record-file.schema";
import { RECORD_FILE_READ_PERMISSIONS, RECORD_NOT_FOUND_CODE } from "@/features/record-files/record-file-access";

@AllowInDemoMode
@TenantInteractor({ permissions: RECORD_FILE_READ_PERMISSIONS, condition: "OR" })
export class GetRecordDocumentsInteractor extends AuthenticatedInteractor<
  RecordDocumentTargetData,
  RecordDocumentListDto
> {
  constructor(
    private repo: GetRecordDocumentsRepo,
    private storage: StorageProvider,
    private signing: SigningProvider,
  ) {
    super();
  }

  @Validate(RecordDocumentTargetSchema)
  @ValidateOutput(RecordDocumentListDtoSchema)
  async invoke({ entityType, recordId }: RecordDocumentTargetData): Validated<RecordDocumentListDto> {
    if (!(await this.repo.isRecordAccessible(entityType, recordId)))
      return failNotFound(RECORD_NOT_FOUND_CODE[entityType], ["recordId"]);

    return {
      ok: true as const,
      data: {
        storageConfigured: this.storage.configured,
        signingConfigured: this.signing.configured,
        maxUploadBytes: this.storage.maxUploadBytes,
        documents: await this.repo.listDocuments(entityType, recordId),
      },
    };
  }
}
