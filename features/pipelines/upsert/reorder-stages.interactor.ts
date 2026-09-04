import type { ReorderStagesRepo } from "./reorder-stages.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { ValidatePipelineIdsInteractor } from "@/core/validation/validators/validate-pipeline-ids.interactor";
import type { ValidatePipelineStageIdsInteractor } from "@/core/validation/validators/validate-pipeline-stage-ids.interactor";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { type PipelineDto, PipelineDtoSchema } from "../pipeline.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { fail } from "@/core/validation/interactor-failure-server";
import { unique } from "@/core/utils/unique";

export const ReorderStagesSchema = z.object({
  pipelineId: z.uuid(),
  stageIds: z.array(z.uuid()).min(1),
});
export type ReorderStagesData = Data<typeof ReorderStagesSchema>;

@TenantInteractor({
  resource: Resource.pipelines,
  action: Action.update,
})
export class ReorderStagesInteractor extends AuthenticatedInteractor<ReorderStagesData, PipelineDto> {
  constructor(
    private repo: ReorderStagesRepo,
    private pipelineValidator: ValidatePipelineIdsInteractor,
    private stageValidator: ValidatePipelineStageIdsInteractor,
  ) {
    super();
  }

  @Write({
    input: ReorderStagesSchema,
    output: PipelineDtoSchema,
    precheck: (self, data, ctx) => self.precheck(data, ctx),
  })
  async invoke(data: ReorderStagesData): Validated<PipelineDto> {
    const orderedStageIds = unique(data.stageIds);
    const previousPipeline = await this.repo.getOrThrowCompanyWide(data.pipelineId);
    const ownStageIds = new Set(previousPipeline.stages.map((stage) => stage.id));

    if (orderedStageIds.some((stageId) => !ownStageIds.has(stageId)))
      return fail(CustomErrorCode.pipelineStageMismatch, ["stageIds"]);

    const pipeline = await this.repo.reorderStagesOrThrow(data.pipelineId, orderedStageIds);

    return { ok: true as const, data: pipeline };
  }

  private async precheck(data: ReorderStagesData, ctx: z.RefinementCtx) {
    await Promise.all([
      this.pipelineValidator.invoke([{ ids: data.pipelineId, path: ["pipelineId"] }], ctx),
      this.stageValidator.invoke([{ ids: data.stageIds, path: ["stageIds"] }], ctx),
    ]);
  }
}
