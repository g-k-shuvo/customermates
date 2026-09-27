import type { Validated } from "@/core/validation/validation.utils";
import type { RecordFileTargetData } from "@/features/record-files/record-file.schema";
import type { GetSignatureSuggestionsRepo } from "./record-document-signing.repo";

import {
  SIGNATURE_RECIPIENT_LIMIT,
  type SignatureSuggestionsDto,
  SignatureSuggestionsDtoSchema,
} from "./record-document-signing.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { RecordFileTargetSchema } from "@/features/record-files/record-file.schema";
import { RECORD_FILE_READ_PERMISSIONS, RECORD_NOT_FOUND_CODE } from "@/features/record-files/record-file-access";

@AllowInDemoMode
@TenantInteractor({ permissions: RECORD_FILE_READ_PERMISSIONS, condition: "OR" })
export class GetSignatureSuggestionsInteractor extends AuthenticatedInteractor<
  RecordFileTargetData,
  SignatureSuggestionsDto
> {
  constructor(private repo: GetSignatureSuggestionsRepo) {
    super();
  }

  @Validate(RecordFileTargetSchema)
  @ValidateOutput(SignatureSuggestionsDtoSchema)
  async invoke({ entityType, recordId }: RecordFileTargetData): Validated<SignatureSuggestionsDto> {
    if (!(await this.repo.isRecordAccessible(entityType, recordId)))
      return failNotFound(RECORD_NOT_FOUND_CODE[entityType], ["recordId"]);

    return {
      ok: true as const,
      data: {
        recipients: await this.repo.suggestSignatureRecipients(entityType, recordId, SIGNATURE_RECIPIENT_LIMIT),
      },
    };
  }
}
