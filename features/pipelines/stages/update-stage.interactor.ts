import type { UpdateStageRepo } from "./update-stage.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { ValidatePipelineStageIdsInteractor } from "@/core/validation/validators/validate-pipeline-stage-ids.interactor";

import { z } from "zod";
import { Resource, Action, StageKind } from "@/generated/prisma";

import { type PipelineStageDto, PipelineStageDtoSchema } from "../pipeline.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { zx } from "@/core/validation/validation.utils";

export const UpdateStageSchema = z.object({
  id: z.uuid(),
  name: zx.nonBlankText(255).optional(),
  position: z.number().int().min(0).optional(),
  probability: z.number().min(0).max(100).optional(),
  rottingDays: z.number().int().min(1).nullish(),
  kind: z.enum(StageKind).optional(),
});
export type UpdateStageData = Data<typeof UpdateStageSchema>;

@TenantInteractor({
  resource: Resource.pipelines,
  action: Action.update,
})
export class UpdateStageInteractor extends AuthenticatedInteractor<UpdateStageData, PipelineStageDto> {
  constructor(
    private repo: UpdateStageRepo,
    private validator: ValidatePipelineStageIdsInteractor,
  ) {
    super();
  }

  @Write({
    input: UpdateStageSchema,
    output: PipelineStageDtoSchema,
    precheck: (self, data, ctx) => self.validator.invoke([{ ids: data.id, path: ["id"] }], ctx),
  })
  async invoke(data: UpdateStageData): Validated<PipelineStageDto> {
    const stage = await this.repo.updateStageOrThrow(data);

    return { ok: true as const, data: stage };
  }
}
