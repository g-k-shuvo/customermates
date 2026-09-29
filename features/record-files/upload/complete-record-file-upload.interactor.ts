import type { Validated } from "@/core/validation/validation.utils";
import type { StorageProvider, StoredObjectStat } from "@/core/storage/storage-provider";
import type { VirusScanner } from "@/core/storage/virus-scanner";
import type { UserService } from "@/features/user/user.service";
import type { CompleteRecordFileUploadRepo } from "./complete-record-file-upload.repo";

import { Action } from "@/generated/prisma";

import {
  type RecordFileDto,
  type RecordFileIdData,
  RecordFileDtoSchema,
  RecordFileIdSchema,
} from "../record-file.schema";
import { RECORD_FILE_RESOURCE, RECORD_FILE_WRITE_PERMISSIONS, storageFailure } from "../record-file-access";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { uploadedObjectMatches } from "@/core/storage/upload-policy";
import { type ScanVerdict } from "@/core/storage/virus-scanner";
import {
  failAuthorization,
  failConflict,
  failNotFound,
  failUnavailable,
} from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

@TenantInteractor({ permissions: RECORD_FILE_WRITE_PERMISSIONS, condition: "OR" })
export class CompleteRecordFileUploadInteractor extends AuthenticatedInteractor<RecordFileIdData, RecordFileDto> {
  constructor(
    private repo: CompleteRecordFileUploadRepo,
    private storage: StorageProvider,
    private userService: UserService,
    private scanner: VirusScanner,
  ) {
    super();
  }

  @Write({ input: RecordFileIdSchema, output: RecordFileDtoSchema, tx: false })
  async invoke({ id }: RecordFileIdData): Validated<RecordFileDto> {
    const pending = await this.repo.findPendingFileOrNull(id);
    if (!pending) return failNotFound(CustomErrorCode.recordFileNotFound, ["id"]);

    if (!this.userService.hasPermissionForUser(this.user, RECORD_FILE_RESOURCE[pending.entityType], Action.update))
      return failAuthorization(CustomErrorCode.permissionDenied, ["id"]);

    if (!this.storage.configured) return failUnavailable(CustomErrorCode.fileStorageNotConfigured);

    let stat: StoredObjectStat | null;
    try {
      stat = await this.storage.statObject(pending.storageKey);
    } catch (error) {
      return storageFailure(error);
    }

    if (!stat) return failConflict(CustomErrorCode.fileUploadIncomplete, ["id"]);

    if (!uploadedObjectMatches(stat, pending)) {
      await this.storage.deleteObject(pending.storageKey).catch(() => undefined);
      await this.repo.deletePendingFile(id);

      return failConflict(CustomErrorCode.fileUploadIncomplete, ["id"]);
    }

    if (this.scanner.configured) {
      let verdict: ScanVerdict;
      try {
        verdict = await this.scanner.scan((await this.storage.getObject(pending.storageKey)).body);
      } catch {
        return failUnavailable(CustomErrorCode.virusScanUnavailable);
      }

      if (!verdict.clean) {
        await this.storage.deleteObject(pending.storageKey).catch(() => undefined);
        await this.repo.deletePendingFile(id);

        return failConflict(CustomErrorCode.fileInfected, ["id"]);
      }
    }

    const ready = await this.repo.markFileReadyOrNull(id);
    if (!ready) return failNotFound(CustomErrorCode.recordFileNotFound, ["id"]);

    return { ok: true as const, data: ready };
  }
}
