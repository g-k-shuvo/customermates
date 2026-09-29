import type { BulkJobRepo } from "../bulk-job.repo";
import type { Validated } from "@/core/validation/validation.utils";

import { type BulkJobDto, BulkJobDtoSchema, type BulkJobIdData, BulkJobIdSchema } from "../bulk-job.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

@AllowInDemoMode
@TenantInteractor()
export class GetBulkJobInteractor extends AuthenticatedInteractor<BulkJobIdData, BulkJobDto> {
  constructor(private repo: BulkJobRepo) {
    super();
  }

  @Validate(BulkJobIdSchema)
  @ValidateOutput(BulkJobDtoSchema)
  async invoke(data: BulkJobIdData): Validated<BulkJobDto> {
    const job = await this.repo.findJobOrNull(data.id);
    if (!job) return failNotFound(CustomErrorCode.bulkJobNotFound, ["id"]);

    return { ok: true as const, data: job };
  }
}
