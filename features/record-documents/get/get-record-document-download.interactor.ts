import type { Data, Validated } from "@/core/validation/validation.utils";
import type { StorageProvider } from "@/core/storage/storage-provider";
import type { RecordFileDownloadDto } from "@/features/record-files/record-file.schema";
import type { GetRecordDocumentDownloadRepo, StoredDocumentPdfs } from "./get-record-document-download.repo";

import { z } from "zod";
import { RecordDocumentFileKind } from "@/generated/prisma";

import { RecordDocumentFileKindSchema } from "../record-document.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { failNotFound, failUnavailable } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordFileDownloadDtoSchema } from "@/features/record-files/record-file.schema";
import { RECORD_FILE_READ_PERMISSIONS, storageFailure } from "@/features/record-files/record-file-access";

export const GetRecordDocumentDownloadSchema = z.object({
  id: z.uuid(),
  version: RecordDocumentFileKindSchema.optional(),
});

export type GetRecordDocumentDownloadData = Data<typeof GetRecordDocumentDownloadSchema>;

function chosenPdf(pdfs: StoredDocumentPdfs, version: RecordDocumentFileKind | undefined) {
  if (version === RecordDocumentFileKind.original) return pdfs.original;
  if (version === RecordDocumentFileKind.signed) return pdfs.signed;

  return pdfs.signed ?? pdfs.original;
}

@AllowInDemoMode
@TenantInteractor({ permissions: RECORD_FILE_READ_PERMISSIONS, condition: "OR" })
export class GetRecordDocumentDownloadInteractor extends AuthenticatedInteractor<
  GetRecordDocumentDownloadData,
  RecordFileDownloadDto
> {
  constructor(
    private repo: GetRecordDocumentDownloadRepo,
    private storage: StorageProvider,
  ) {
    super();
  }

  @Validate(GetRecordDocumentDownloadSchema)
  @ValidateOutput(RecordFileDownloadDtoSchema)
  async invoke({ id, version }: GetRecordDocumentDownloadData): Validated<RecordFileDownloadDto> {
    const pdfs = await this.repo.findListedDocumentPdfsOrNull(id);
    if (!pdfs) return failNotFound(CustomErrorCode.recordDocumentNotFound, ["id"]);

    const pdf = chosenPdf(pdfs, version);
    if (!pdf) return failNotFound(CustomErrorCode.recordDocumentNotFound, ["version"]);

    if (!this.storage.configured) return failUnavailable(CustomErrorCode.fileStorageNotConfigured);

    try {
      const link = await this.storage.presignDownload({
        key: pdf.storageKey,
        fileName: pdf.fileName,
        contentType: "application/pdf",
        disposition: "inline",
      });

      return { ok: true as const, data: link };
    } catch (error) {
      return storageFailure(error);
    }
  }
}
