import type { CreatePipelineRepo } from "./create-pipeline.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { Resource, Action } from "@/generated/prisma";

import { type PipelineDto, PipelineDtoSchema } from "../pipeline.schema";

import { BaseCreatePipelineSchema } from "./create-pipeline-base.schema";

import { duplicateStageKindIndex } from "../stage-kind-uniqueness";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { failConflict } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

export const CreatePipelineSchema = BaseCreatePipelineSchema;
export type CreatePipelineData = Data<typeof CreatePipelineSchema>;

@TenantInteractor({
  resource: Resource.pipelines,
  action: Action.create,
})
export class CreatePipelineInteractor extends AuthenticatedInteractor<CreatePipelineData, PipelineDto> {
  constructor(private repo: CreatePipelineRepo) {
    super();
  }

  @Write({
    input: CreatePipelineSchema,
    output: PipelineDtoSchema,
  })
  async invoke(data: CreatePipelineData): Validated<PipelineDto> {
    const duplicateIndex = duplicateStageKindIndex(data.stages);

    if (duplicateIndex !== null)
      return failConflict(CustomErrorCode.pipelineStageKindDuplicate, ["stages", duplicateIndex, "kind"]);

    if (data.isDefault) await this.repo.demoteDefaultPipelinesExcept(null);

    const pipeline = await this.repo.createPipelineOrThrow(data);

    return { ok: true as const, data: pipeline };
  }
}
