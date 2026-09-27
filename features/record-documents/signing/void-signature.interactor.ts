import type { Validated } from "@/core/validation/validation.utils";
import type { SigningProvider } from "@/core/signing/signing-provider";
import type { UserService } from "@/features/user/user.service";
import type { RecordDocumentDto } from "../record-document.schema";
import type { SignRecordDocumentRepo } from "./record-document-signing.repo";
import type { RecordDocumentSigningService } from "./record-document-signing.service";

import { Action } from "@/generated/prisma";

import { RecordDocumentDtoSchema } from "../record-document.schema";

import { type VoidSignatureData, VoidSignatureSchema } from "./record-document-signing.schema";
import { isEnvelopeActive } from "./active-envelope";
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
import { SigningEnvelopeStatus } from "@/core/signing/signing-provider";
import { RECORD_FILE_RESOURCE, RECORD_FILE_WRITE_PERMISSIONS } from "@/features/record-files/record-file-access";

export const DEFAULT_VOID_REASON = "The sender cancelled this signature request.";

@TenantInteractor({ permissions: RECORD_FILE_WRITE_PERMISSIONS, condition: "OR" })
export class VoidSignatureInteractor extends AuthenticatedInteractor<VoidSignatureData, RecordDocumentDto> {
  constructor(
    private repo: SignRecordDocumentRepo,
    private signing: SigningProvider,
    private service: RecordDocumentSigningService,
    private userService: UserService,
  ) {
    super();
  }

  @Write({ input: VoidSignatureSchema, output: RecordDocumentDtoSchema, tx: false })
  async invoke({ id, reason }: VoidSignatureData): Validated<RecordDocumentDto> {
    const document = await this.repo.findSignableDocumentOrNull(id);
    if (!document) return failNotFound(CustomErrorCode.recordDocumentNotFound, ["id"]);

    if (!this.userService.hasPermissionForUser(this.user, RECORD_FILE_RESOURCE[document.entityType], Action.update))
      return failAuthorization(CustomErrorCode.permissionDenied, ["id"]);

    if (!this.signing.configured) return failUnavailable(CustomErrorCode.signingNotConfigured);

    if (!document.envelopeId || !isEnvelopeActive(document.envelopeStatus))
      return failConflict(CustomErrorCode.signatureNotInProgress, ["id"]);

    try {
      await this.signing.voidEnvelope(document.envelopeId, reason ?? DEFAULT_VOID_REASON);
    } catch (error) {
      return signingFailure(error);
    }

    await this.service.apply(
      { ...document, envelopeId: document.envelopeId, companyId: this.companyId },
      { envelopeId: document.envelopeId, status: SigningEnvelopeStatus.voided, recipients: document.recipients },
    );

    const updated = await this.repo.findListedDocumentOrNull(id);
    if (!updated) return failNotFound(CustomErrorCode.recordDocumentNotFound, ["id"]);

    return { ok: true as const, data: updated };
  }
}
