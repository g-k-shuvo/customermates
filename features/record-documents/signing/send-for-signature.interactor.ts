import type { Validated } from "@/core/validation/validation.utils";
import type { SigningProvider } from "@/core/signing/signing-provider";
import type { StorageProvider } from "@/core/storage/storage-provider";
import type { UserService } from "@/features/user/user.service";
import type { RecordDocumentDto } from "../record-document.schema";
import type { SignRecordDocumentRepo } from "./record-document-signing.repo";

import { Action, RecordDocumentStatus } from "@/generated/prisma";

import { RecordDocumentDtoSchema } from "../record-document.schema";

import {
  type SendForSignatureData,
  SIGNATURE_SUBJECT_MAX_LENGTH,
  SendForSignatureSchema,
} from "./record-document-signing.schema";
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
import { env } from "@/env";
import {
  RECORD_FILE_RESOURCE,
  RECORD_FILE_WRITE_PERMISSIONS,
  storageFailure,
} from "@/features/record-files/record-file-access";

const SENDABLE_STATUSES: ReadonlySet<RecordDocumentStatus> = new Set([
  RecordDocumentStatus.draft,
  RecordDocumentStatus.declined,
  RecordDocumentStatus.voided,
]);

export const SIGNING_CALLBACK_PATH = "/api/webhooks/docusign";

@TenantInteractor({ permissions: RECORD_FILE_WRITE_PERMISSIONS, condition: "OR" })
export class SendForSignatureInteractor extends AuthenticatedInteractor<SendForSignatureData, RecordDocumentDto> {
  constructor(
    private repo: SignRecordDocumentRepo,
    private signing: SigningProvider,
    private storage: StorageProvider,
    private userService: UserService,
    private now: () => Date = () => new Date(),
  ) {
    super();
  }

  @Write({ input: SendForSignatureSchema, output: RecordDocumentDtoSchema, tx: false })
  async invoke(data: SendForSignatureData): Validated<RecordDocumentDto> {
    const document = await this.repo.findSignableDocumentOrNull(data.id);
    if (!document) return failNotFound(CustomErrorCode.recordDocumentNotFound, ["id"]);

    if (!this.userService.hasPermissionForUser(this.user, RECORD_FILE_RESOURCE[document.entityType], Action.update))
      return failAuthorization(CustomErrorCode.permissionDenied, ["id"]);

    if (!this.signing.configured) return failUnavailable(CustomErrorCode.signingNotConfigured);

    if (isEnvelopeActive(document.envelopeStatus)) return failConflict(CustomErrorCode.signatureInProgress, ["id"]);

    if (!SENDABLE_STATUSES.has(document.status)) return failConflict(CustomErrorCode.documentNotSendable, ["id"]);

    if (!this.storage.configured) return failUnavailable(CustomErrorCode.fileStorageNotConfigured);

    let pdf: Uint8Array;
    try {
      const object = await this.storage.getObject(document.original.storageKey);
      pdf = new Uint8Array(await new Response(object.body).arrayBuffer());
    } catch (error) {
      return storageFailure(error);
    }

    let envelopeId: string;
    try {
      ({ envelopeId } = await this.signing.sendEnvelope({
        subject: data.subject ?? document.title.slice(0, SIGNATURE_SUBJECT_MAX_LENGTH),
        message: data.message ?? null,
        fileName: document.original.fileName,
        pdf,
        recipients: data.recipients,
        callbackUrl: `${env.BASE_URL}${SIGNING_CALLBACK_PATH}`,
      }));
    } catch (error) {
      return signingFailure(error);
    }

    const sent = await this.repo.recordEnvelopeSentOrNull(document.id, {
      envelopeId,
      recipients: data.recipients.map((recipient) => ({ ...recipient, status: "sent", completedAt: null })),
      sentAt: this.now(),
    });
    if (!sent) return failNotFound(CustomErrorCode.recordDocumentNotFound, ["id"]);

    return { ok: true as const, data: sent };
  }
}
