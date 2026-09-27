import type { Validated } from "@/core/validation/validation.utils";
import type { SigningEnvelopeState, SigningProvider } from "@/core/signing/signing-provider";
import type { UserService } from "@/features/user/user.service";
import type { RecordDocumentDto, RecordDocumentIdData } from "../record-document.schema";
import type { SignRecordDocumentRepo } from "./record-document-signing.repo";
import type { RecordDocumentSigningService } from "./record-document-signing.service";

import { Action } from "@/generated/prisma";

import { RecordDocumentDtoSchema, RecordDocumentIdSchema } from "../record-document.schema";

import { signingFailure } from "./signing-failure";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import {
  failAuthorization,
  failConflict,
  failNotFound,
  failUnavailable,
} from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { SigningError } from "@/core/signing/signing-provider";
import { storageFailure } from "@/features/record-files/record-file-access";
import { StorageError } from "@/core/storage/storage-provider";
import { RECORD_FILE_RESOURCE, RECORD_FILE_WRITE_PERMISSIONS } from "@/features/record-files/record-file-access";

@TenantInteractor({ permissions: RECORD_FILE_WRITE_PERMISSIONS, condition: "OR" })
export class RefreshSignatureInteractor extends AuthenticatedInteractor<RecordDocumentIdData, RecordDocumentDto> {
  constructor(
    private repo: SignRecordDocumentRepo,
    private signing: SigningProvider,
    private service: RecordDocumentSigningService,
    private userService: UserService,
  ) {
    super();
  }

  @Write({ input: RecordDocumentIdSchema, output: RecordDocumentDtoSchema, tx: false })
  async invoke({ id }: RecordDocumentIdData): Validated<RecordDocumentDto> {
    const document = await this.repo.findSignableDocumentOrNull(id);
    if (!document) return failNotFound(CustomErrorCode.recordDocumentNotFound, ["id"]);

    if (!this.userService.hasPermissionForUser(this.user, RECORD_FILE_RESOURCE[document.entityType], Action.update))
      return failAuthorization(CustomErrorCode.permissionDenied, ["id"]);

    if (!this.signing.configured) return failUnavailable(CustomErrorCode.signingNotConfigured);

    if (!document.envelopeId) return failConflict(CustomErrorCode.signatureNotInProgress, ["id"]);

    let state: SigningEnvelopeState;
    try {
      state = await this.signing.fetchEnvelope(document.envelopeId);
      await this.service.apply({ ...document, envelopeId: document.envelopeId, companyId: this.companyId }, state);
    } catch (error) {
      if (error instanceof StorageError) return storageFailure(error);
      if (error instanceof SigningError) return signingFailure(error);
      throw error;
    }

    const updated = await this.repo.findListedDocumentOrNull(id);
    if (!updated) return failNotFound(CustomErrorCode.recordDocumentNotFound, ["id"]);

    return { ok: true as const, data: updated };
  }
}
