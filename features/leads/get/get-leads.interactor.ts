import type { P13nRepo } from "@/core/base/base-get.interactor";
import type { QueryParamsPrecheckInteractor } from "@/core/base/query-params-precheck.interactor";

import { EntityType, Resource, Action } from "@/generated/prisma";

import { type LeadDto } from "../lead.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { BaseGetInteractor, BaseGetRepo } from "@/core/base/base-get.interactor";
import { GetQueryParamsSchema, type GetQueryParams, createGetResultSchema } from "@/core/base/base-get.schema";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { LeadDtoSchema } from "../lead.schema";

export abstract class GetLeadsRepo extends BaseGetRepo<LeadDto> {}

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.leads, action: Action.readAll },
    { resource: Resource.leads, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetLeadsInteractor extends BaseGetInteractor<LeadDto> {
  constructor(
    repo: GetLeadsRepo,
    p13nRepo: P13nRepo,
    mode: "interactive" | "api",
    queryParamsPrecheck: QueryParamsPrecheckInteractor,
  ) {
    super(
      repo,
      p13nRepo,
      mode,
      EntityType.lead,
      { sortDescriptor: { field: "createdAt", direction: "desc" } },
      queryParamsPrecheck,
    );
  }

  @Validate(GetQueryParamsSchema)
  @ValidateOutput(createGetResultSchema(LeadDtoSchema))
  async invoke(params: GetQueryParams = {}) {
    return await super.invoke(params);
  }
}
