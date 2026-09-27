import type { Data, Validated } from "@/core/validation/validation.utils";
import type { UserService } from "@/features/user/user.service";
import type { UpdateRecordDocumentRepo } from "./update-record-document.repo";

import { z } from "zod";
import { Action } from "@/generated/prisma";

import {
  RECORD_DOCUMENT_TITLE_MAX_LENGTH,
  type RecordDocumentDto,
  RecordDocumentDtoSchema,
  RecordDocumentStatusSchema,
} from "../record-document.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { failAuthorization, failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { RECORD_FILE_RESOURCE, RECORD_FILE_WRITE_PERMISSIONS } from "@/features/record-files/record-file-access";
import { isEnvelopeActive } from "@/features/record-documents/signing/active-envelope";

export const UpdateRecordDocumentSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(RECORD_DOCUMENT_TITLE_MAX_LENGTH).optional(),
  status: RecordDocumentStatusSchema.optional(),
});

export type UpdateRecordDocumentData = Data<typeof UpdateRecordDocumentSchema>;

@TenantInteractor({ permissions: RECORD_FILE_WRITE_PERMISSIONS, condition: "OR" })
export class UpdateRecordDocumentInteractor extends AuthenticatedInteractor<
  UpdateRecordDocumentData,
  RecordDocumentDto
> {
  constructor(
    private repo: UpdateRecordDocumentRepo,
    private userService: UserService,
  ) {
    super();
  }

  @Write({ input: UpdateRecordDocumentSchema, output: RecordDocumentDtoSchema })
  async invoke({ id, title, status }: UpdateRecordDocumentData): Validated<RecordDocumentDto> {
    const document = await this.repo.findListedDocumentOrNull(id);
    if (!document) return failNotFound(CustomErrorCode.recordDocumentNotFound, ["id"]);

    if (!this.userService.hasPermissionForUser(this.user, RECORD_FILE_RESOURCE[document.entityType], Action.update))
      return failAuthorization(CustomErrorCode.permissionDenied, ["id"]);

    if (status !== undefined && status !== document.status && isEnvelopeActive(document.signature?.status))
      return failConflict(CustomErrorCode.signatureInProgress, ["status"]);

    const updated = await this.repo.updateDocumentOrNull(id, { title, status });
    if (!updated) return failNotFound(CustomErrorCode.recordDocumentNotFound, ["id"]);

    return { ok: true as const, data: updated };
  }
}
