import type { Validated } from "@/core/validation/validation.utils";
import type { StorageProvider } from "@/core/storage/storage-provider";
import type { UserService } from "@/features/user/user.service";
import type { DeleteRecordDocumentRepo } from "./delete-record-document.repo";

import { Action } from "@/generated/prisma";

import {
  type DeleteRecordDocumentResult,
  type RecordDocumentIdData,
  DeleteRecordDocumentResultSchema,
  RecordDocumentIdSchema,
} from "../record-document.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { failAuthorization, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import {
  RECORD_FILE_RESOURCE,
  RECORD_FILE_WRITE_PERMISSIONS,
  storageFailure,
} from "@/features/record-files/record-file-access";

@TenantInteractor({ permissions: RECORD_FILE_WRITE_PERMISSIONS, condition: "OR" })
export class DeleteRecordDocumentInteractor extends AuthenticatedInteractor<
  RecordDocumentIdData,
  DeleteRecordDocumentResult
> {
  constructor(
    private repo: DeleteRecordDocumentRepo,
    private storage: StorageProvider,
    private userService: UserService,
  ) {
    super();
  }

  @Write({ input: RecordDocumentIdSchema, output: DeleteRecordDocumentResultSchema, tx: false })
  async invoke({ id }: RecordDocumentIdData): Validated<DeleteRecordDocumentResult> {
    const document = await this.repo.findDocumentOrNull(id);
    if (!document) return failNotFound(CustomErrorCode.recordDocumentNotFound, ["id"]);

    if (!this.userService.hasPermissionForUser(this.user, RECORD_FILE_RESOURCE[document.entityType], Action.update))
      return failAuthorization(CustomErrorCode.permissionDenied, ["id"]);

    if (this.storage.configured) {
      try {
        for (const key of document.storageKeys) await this.storage.deleteObject(key);
      } catch (error) {
        return storageFailure(error);
      }
    }

    await this.repo.deleteDocument(id);

    return { ok: true as const, data: { id } };
  }
}
