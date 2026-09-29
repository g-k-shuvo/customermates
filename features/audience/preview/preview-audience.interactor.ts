import type { AudienceRepo } from "../audience.repo";
import type { Validated } from "@/core/validation/validation.utils";

import {
  AUDIENCE_PREVIEW_LIMIT,
  AUDIENCE_READ,
  type AudienceDefinition,
  AudienceDefinitionSchema,
  type AudiencePreviewDto,
  AudiencePreviewDtoSchema,
} from "../audience.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

export async function audienceReferenceFailure(repo: AudienceRepo, definition: AudienceDefinition) {
  const unknown = await repo.findUnknownReferences(definition);
  if (unknown.listIds.length > 0) return failNotFound(CustomErrorCode.contactListNotFound, ["conditions"]);
  if (unknown.columnIds.length > 0) return failNotFound(CustomErrorCode.audienceFieldUnknown, ["conditions"]);

  return null;
}

@AllowInDemoMode
@TenantInteractor(AUDIENCE_READ)
export class PreviewAudienceInteractor extends AuthenticatedInteractor<AudienceDefinition, AudiencePreviewDto> {
  constructor(private repo: AudienceRepo) {
    super();
  }

  @Validate(AudienceDefinitionSchema)
  @ValidateOutput(AudiencePreviewDtoSchema)
  async invoke(data: AudienceDefinition): Validated<AudiencePreviewDto> {
    const failure = await audienceReferenceFailure(this.repo, data);
    if (failure) return failure;

    const [counts, sample] = await Promise.all([
      this.repo.countAudience(data),
      this.repo.findRecipientsPage(data, null, AUDIENCE_PREVIEW_LIMIT),
    ]);

    return { ok: true as const, data: { ...counts, sample } };
  }
}
