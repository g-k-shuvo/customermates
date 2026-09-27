import type { Data, Validated } from "@/core/validation/validation.utils";
import type { StorageProvider } from "@/core/storage/storage-provider";
import type { UserService } from "@/features/user/user.service";
import type { CreateSignedCopyUploadRepo } from "./create-signed-copy-upload.repo";

import { z } from "zod";
import { Action } from "@/generated/prisma";

import {
  type RecordDocumentUploadDto,
  RecordDocumentPdfSchema,
  RecordDocumentUploadDtoSchema,
} from "../record-document.schema";
import { checkDocumentPdf, documentPdfRefusal } from "../record-document-access";

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
import {
  RECORD_FILE_RESOURCE,
  RECORD_FILE_WRITE_PERMISSIONS,
  storageFailure,
} from "@/features/record-files/record-file-access";
import { isEnvelopeActive } from "@/features/record-documents/signing/active-envelope";

export const CreateSignedCopyUploadSchema = RecordDocumentPdfSchema.extend({ id: z.uuid() });

export type CreateSignedCopyUploadData = Data<typeof CreateSignedCopyUploadSchema>;

@TenantInteractor({ permissions: RECORD_FILE_WRITE_PERMISSIONS, condition: "OR" })
export class CreateSignedCopyUploadInteractor extends AuthenticatedInteractor<
  CreateSignedCopyUploadData,
  RecordDocumentUploadDto
> {
  constructor(
    private repo: CreateSignedCopyUploadRepo,
    private storage: StorageProvider,
    private userService: UserService,
  ) {
    super();
  }

  @Write({ input: CreateSignedCopyUploadSchema, output: RecordDocumentUploadDtoSchema })
  async invoke(data: CreateSignedCopyUploadData): Validated<RecordDocumentUploadDto> {
    const document = await this.repo.findListedDocumentOrNull(data.id);
    if (!document) return failNotFound(CustomErrorCode.recordDocumentNotFound, ["id"]);

    if (!this.userService.hasPermissionForUser(this.user, RECORD_FILE_RESOURCE[document.entityType], Action.update))
      return failAuthorization(CustomErrorCode.permissionDenied, ["id"]);

    if (isEnvelopeActive(document.signature?.status)) return failConflict(CustomErrorCode.signatureInProgress, ["id"]);

    if (!this.storage.configured) return failUnavailable(CustomErrorCode.fileStorageNotConfigured);

    const checked = checkDocumentPdf({
      fileName: data.fileName,
      contentType: data.contentType,
      byteSize: data.byteSize,
      maxBytes: this.storage.maxUploadBytes,
    });
    if (!checked.ok) return documentPdfRefusal(checked);

    const storageKey = mintStorageKey({
      companyId: this.companyId,
      scope: "document",
      recordId: document.recordId,
      extension: checked.extension,
    });

    try {
      const upload = await this.storage.presignUpload({
        key: storageKey,
        contentType: checked.contentType,
        byteSize: data.byteSize,
      });
      const file = await this.repo.createPendingSignedFile({
        documentId: document.id,
        storageKey,
        fileName: data.fileName,
        byteSize: data.byteSize,
      });

      return { ok: true as const, data: { document, file, upload } };
    } catch (error) {
      return storageFailure(error);
    }
  }
}
