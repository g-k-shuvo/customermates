import type { CreateStageRepo } from "./create-stage.repo";
import type { FindTerminalStageRepo } from "../find-terminal-stage.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { ValidatePipelineIdsInteractor } from "@/core/validation/validators/validate-pipeline-ids.interactor";

import { z } from "zod";
import { Resource, Action, StageKind } from "@/generated/prisma";

import { type PipelineStageDto, PipelineStageDtoSchema } from "../pipeline.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { zx } from "@/core/validation/validation.utils";
import { failConflict } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

export const CreateStageSchema = z.object({
  pipelineId: z.uuid(),
  name: zx.nonBlankText(255),
  position: z.number().int().min(0).optional(),
  probability: z.number().min(0).max(100).optional().default(0),
  rottingDays: z.number().int().min(1).nullish(),
  kind: z.enum(StageKind).optional().default(StageKind.open),
});
export type CreateStageData = Data<typeof CreateStageSchema>;

@TenantInteractor({
  resource: Resource.pipelines,
  action: Action.create,
})
export class CreateStageInteractor extends AuthenticatedInteractor<CreateStageData, PipelineStageDto> {
  constructor(
    private repo: CreateStageRepo,
    private terminalStageRepo: FindTerminalStageRepo,
    private validator: ValidatePipelineIdsInteractor,
  ) {
    super();
  }

  @Write({
    input: CreateStageSchema,
    output: PipelineStageDtoSchema,
    precheck: (self, data, ctx) => self.validator.invoke([{ ids: data.pipelineId, path: ["pipelineId"] }], ctx),
  })
  async invoke(data: CreateStageData): Validated<PipelineStageDto> {
    if (data.kind !== StageKind.open) {
      const claimant = await this.terminalStageRepo.findStageIdByKind(data.pipelineId, data.kind);

      if (claimant) return failConflict(CustomErrorCode.pipelineStageKindDuplicate, ["kind"]);
    }

    const stage = await this.repo.createStageOrThrow(data);

    return { ok: true as const, data: stage };
  }
}
