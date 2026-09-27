import type { Validated } from "@/core/validation/validation.utils";
import type { StorageProvider, StoredObjectStat } from "@/core/storage/storage-provider";
import type { UserService } from "@/features/user/user.service";
import type { CompleteRecordDocumentFileRepo } from "./complete-record-document-file.repo";

import { Action, RecordDocumentFileKind } from "@/generated/prisma";

import {
  type RecordDocumentDto,
  type RecordDocumentFileIdData,
  RecordDocumentDtoSchema,
  RecordDocumentFileIdSchema,
} from "../record-document.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { uploadedObjectMatches } from "@/core/storage/upload-policy";
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

@TenantInteractor({ permissions: RECORD_FILE_WRITE_PERMISSIONS, condition: "OR" })
export class CompleteRecordDocumentFileInteractor extends AuthenticatedInteractor<
  RecordDocumentFileIdData,
  RecordDocumentDto
> {
  constructor(
    private repo: CompleteRecordDocumentFileRepo,
    private storage: StorageProvider,
    private userService: UserService,
  ) {
    super();
  }

  @Write({ input: RecordDocumentFileIdSchema, output: RecordDocumentDtoSchema, tx: false })
  async invoke({ id, fileId }: RecordDocumentFileIdData): Validated<RecordDocumentDto> {
    const pending = await this.repo.findPendingFileOrNull(id, fileId);
    if (!pending) return failNotFound(CustomErrorCode.recordDocumentNotFound, ["fileId"]);

    if (!this.userService.hasPermissionForUser(this.user, RECORD_FILE_RESOURCE[pending.entityType], Action.update))
      return failAuthorization(CustomErrorCode.permissionDenied, ["fileId"]);

    if (!this.storage.configured) return failUnavailable(CustomErrorCode.fileStorageNotConfigured);

    let stat: StoredObjectStat | null;
    try {
      stat = await this.storage.statObject(pending.storageKey);
    } catch (error) {
      return storageFailure(error);
    }

    if (!stat) return failConflict(CustomErrorCode.fileUploadIncomplete, ["fileId"]);

    if (!uploadedObjectMatches(stat, { byteSize: pending.byteSize, contentType: "application/pdf" })) {
      await this.storage.deleteObject(pending.storageKey).catch(() => undefined);
      await this.repo.discardPendingFile(pending);

      return failConflict(CustomErrorCode.fileUploadIncomplete, ["fileId"]);
    }

    const superseded =
      pending.kind === RecordDocumentFileKind.signed ? await this.repo.findSupersededSignedFiles(id, fileId) : [];
    const document = await this.repo.markFileReadyOrNull(pending, superseded);
    if (!document) return failNotFound(CustomErrorCode.recordDocumentNotFound, ["fileId"]);

    await Promise.all(superseded.map((file) => this.storage.deleteObject(file.storageKey).catch(() => undefined)));

    return { ok: true as const, data: document };
  }
}
