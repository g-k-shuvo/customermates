import type { Validated } from "@/core/validation/validation.utils";

import { Resource, Action } from "@/generated/prisma";

import { type PipelineDto, PipelineDtoSchema } from "../pipeline.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export abstract class GetPipelinesRepo {
  abstract getPipelines(): Promise<PipelineDto[]>;
}

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.pipelines, action: Action.readAll },
    { resource: Resource.pipelines, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetPipelinesInteractor extends AuthenticatedInteractor<void, PipelineDto[]> {
  constructor(private repo: GetPipelinesRepo) {
    super();
  }

  @ValidateOutput(PipelineDtoSchema)
  async invoke(): Validated<PipelineDto[]> {
    const pipelines = await this.repo.getPipelines();

    return { ok: true as const, data: pipelines };
  }
}
