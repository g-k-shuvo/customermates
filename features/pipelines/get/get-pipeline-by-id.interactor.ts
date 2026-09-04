import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { type PipelineDto, PipelineDtoSchema } from "../pipeline.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export const GetPipelineByIdSchema = z.object({
  id: z.uuid(),
});
export type GetPipelineByIdData = Data<typeof GetPipelineByIdSchema>;

export abstract class GetPipelineByIdRepo {
  abstract getPipelineById(id: string): Promise<PipelineDto | null>;
}

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.pipelines, action: Action.readAll },
    { resource: Resource.pipelines, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetPipelineByIdInteractor extends AuthenticatedInteractor<GetPipelineByIdData, PipelineDto | null> {
  constructor(private repo: GetPipelineByIdRepo) {
    super();
  }

  @Validate(GetPipelineByIdSchema)
  @ValidateOutput(PipelineDtoSchema.nullable())
  async invoke(data: GetPipelineByIdData): Validated<PipelineDto | null> {
    const pipeline = await this.repo.getPipelineById(data.id);

    return { ok: true as const, data: pipeline };
  }
}
