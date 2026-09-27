import type { GetResult } from "@/core/base/base-get.interactor";
import type { DataViewStateRepo } from "@/core/data-view/data-view-state.repo";
import type { QueryParamsPrecheckInteractor } from "@/core/base/query-params-precheck.interactor";
import type { Validated } from "@/core/validation/validation.utils";

import { Resource, Action } from "@/generated/prisma";

import { type WebFormSubmissionDto, WebFormSubmissionDtoSchema } from "./web-form-submission.schema";

import { BaseGetInteractor, BaseGetRepo } from "@/core/base/base-get.interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { GetQueryParamsSchema, type GetQueryParams, createGetResultSchema } from "@/core/base/base-get.schema";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export abstract class GetWebFormSubmissionsRepo extends BaseGetRepo<WebFormSubmissionDto> {}

@AllowInDemoMode
@TenantInteractor({ resource: Resource.leads, action: Action.readAll })
export class GetWebFormSubmissionsInteractor extends BaseGetInteractor<WebFormSubmissionDto> {
  constructor(
    repo: GetWebFormSubmissionsRepo,
    viewStateRepo: DataViewStateRepo,
    mode: "interactive" | "api",
    queryParamsPrecheck: QueryParamsPrecheckInteractor,
  ) {
    super(
      repo,
      viewStateRepo,
      mode,
      undefined,
      { sortDescriptor: { field: "receivedAt", direction: "desc" }, pagination: { pageSize: 25, page: 1 } },
      queryParamsPrecheck,
    );
  }

  @Validate(GetQueryParamsSchema)
  @ValidateOutput(createGetResultSchema(WebFormSubmissionDtoSchema))
  async invoke(params: GetQueryParams = {}): Validated<GetResult<WebFormSubmissionDto>> {
    return await super.invoke(params);
  }
}
