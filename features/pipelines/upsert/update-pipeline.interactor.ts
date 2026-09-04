import type { UpdatePipelineRepo } from "./update-pipeline.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { ValidatePipelineIdsInteractor } from "@/core/validation/validators/validate-pipeline-ids.interactor";

import { Resource, Action } from "@/generated/prisma";

import { type PipelineDto, PipelineDtoSchema } from "../pipeline.schema";

import { BaseUpdatePipelineSchema } from "./update-pipeline-base.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { failConflict } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

export const UpdatePipelineSchema = BaseUpdatePipelineSchema;
export type UpdatePipelineData = Data<typeof UpdatePipelineSchema>;

@TenantInteractor({
  resource: Resource.pipelines,
  action: Action.update,
})
export class UpdatePipelineInteractor extends AuthenticatedInteractor<UpdatePipelineData, PipelineDto> {
  constructor(
    private repo: UpdatePipelineRepo,
    private validator: ValidatePipelineIdsInteractor,
  ) {
    super();
  }

  @Write({
    input: UpdatePipelineSchema,
    output: PipelineDtoSchema,
    precheck: (self, data, ctx) => self.validator.invoke([{ ids: data.id, path: ["id"] }], ctx),
  })
  async invoke(data: UpdatePipelineData): Validated<PipelineDto> {
    if (data.isDefault === false) {
      const current = await this.repo.getOrThrowCompanyWide(data.id);
      if (current.isDefault) return failConflict(CustomErrorCode.pipelineDefaultRequired, ["isDefault"]);
    }

    if (data.isDefault) await this.repo.demoteDefaultPipelinesExcept(data.id);

    const pipeline = await this.repo.updatePipelineOrThrow(data);

    return { ok: true as const, data: pipeline };
  }
}
