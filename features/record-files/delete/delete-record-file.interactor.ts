import type { Validated } from "@/core/validation/validation.utils";
import type { StorageProvider } from "@/core/storage/storage-provider";
import type { UserService } from "@/features/user/user.service";
import type { DeleteRecordFileRepo } from "./delete-record-file.repo";

import { Action } from "@/generated/prisma";

import {
  type DeleteRecordFileResult,
  type RecordFileIdData,
  DeleteRecordFileResultSchema,
  RecordFileIdSchema,
} from "../record-file.schema";
import { RECORD_FILE_RESOURCE, RECORD_FILE_WRITE_PERMISSIONS, storageFailure } from "../record-file-access";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { failAuthorization, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

@TenantInteractor({ permissions: RECORD_FILE_WRITE_PERMISSIONS, condition: "OR" })
export class DeleteRecordFileInteractor extends AuthenticatedInteractor<RecordFileIdData, DeleteRecordFileResult> {
  constructor(
    private repo: DeleteRecordFileRepo,
    private storage: StorageProvider,
    private userService: UserService,
  ) {
    super();
  }

  @Write({ input: RecordFileIdSchema, output: DeleteRecordFileResultSchema, tx: false })
  async invoke({ id }: RecordFileIdData): Validated<DeleteRecordFileResult> {
    const file = await this.repo.findFileOrNull(id);
    if (!file) return failNotFound(CustomErrorCode.recordFileNotFound, ["id"]);

    if (!this.userService.hasPermissionForUser(this.user, RECORD_FILE_RESOURCE[file.entityType], Action.update))
      return failAuthorization(CustomErrorCode.permissionDenied, ["id"]);

    if (this.storage.configured) {
      try {
        await this.storage.deleteObject(file.storageKey);
      } catch (error) {
        return storageFailure(error);
      }
    }

    await this.repo.deleteFile(id);

    return { ok: true as const, data: { id } };
  }
}
