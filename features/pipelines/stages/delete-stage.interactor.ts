import type { DeleteStageRepo } from "./delete-stage.repo";
import type { FindStagePipelineRepo } from "../find-stage-pipeline.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { ValidatePipelineStageIdsInteractor } from "@/core/validation/validators/validate-pipeline-stage-ids.interactor";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { fail, failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

export const DeleteStageSchema = z.object({
  id: z.uuid(),
  moveToStageId: z.uuid().optional(),
});
export type DeleteStageData = Data<typeof DeleteStageSchema>;

@TenantInteractor({
  resource: Resource.pipelines,
  action: Action.delete,
})
export class DeleteStageInteractor extends AuthenticatedInteractor<DeleteStageData, string> {
  constructor(
    private repo: DeleteStageRepo,
    private stagePipelineRepo: FindStagePipelineRepo,
    private validator: ValidatePipelineStageIdsInteractor,
  ) {
    super();
  }

  @Write({
    input: DeleteStageSchema,
    output: z.string(),
    precheck: (self, data, ctx) =>
      self.validator.invoke(
        [
          { ids: data.id, path: ["id"] },
          { ids: data.moveToStageId, path: ["moveToStageId"] },
        ],
        ctx,
      ),
  })
  async invoke(data: DeleteStageData): Validated<string> {
    if (data.moveToStageId === data.id) return fail(CustomErrorCode.pipelineStageMismatch, ["moveToStageId"]);

    const stageIds = new Set([data.id]);
    if (data.moveToStageId) stageIds.add(data.moveToStageId);

    const pipelineIdsByStageId = await this.stagePipelineRepo.findPipelineIdsByStageIds(stageIds);

    const pipelineId = pipelineIdsByStageId.get(data.id);
    if (!pipelineId) return failNotFound(CustomErrorCode.pipelineStageNotFound, ["id"]);

    if (data.moveToStageId && pipelineIdsByStageId.get(data.moveToStageId) !== pipelineId)
      return fail(CustomErrorCode.pipelineStageMismatch, ["moveToStageId"]);

    const stagesInPipeline = await this.repo.countStagesInPipeline(pipelineId);
    if (stagesInPipeline <= 1) return failConflict(CustomErrorCode.pipelineStageLastInPipeline, ["id"]);

    const dealCount = await this.repo.countDealsInStage(data.id);

    if (dealCount > 0 && !data.moveToStageId)
      return failConflict(CustomErrorCode.pipelineStageHasDeals, ["id"], { count: dealCount });

    if (dealCount > 0 && data.moveToStageId) await this.repo.moveDealsToStage(data.id, data.moveToStageId);

    await this.repo.deleteStageOrThrow(data.id);

    return { ok: true as const, data: data.id };
  }
}
