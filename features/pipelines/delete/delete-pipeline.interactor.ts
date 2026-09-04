import type { DeletePipelineRepo } from "./delete-pipeline.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { ValidatePipelineIdsInteractor } from "@/core/validation/validators/validate-pipeline-ids.interactor";

import { Resource, Action } from "@/generated/prisma";
import { z } from "zod";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { failConflict } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

export const DeletePipelineSchema = z.object({
  id: z.uuid(),
});
export type DeletePipelineData = Data<typeof DeletePipelineSchema>;

@TenantInteractor({ resource: Resource.pipelines, action: Action.delete })
export class DeletePipelineInteractor extends AuthenticatedInteractor<DeletePipelineData, string> {
  constructor(
    private repo: DeletePipelineRepo,
    private validator: ValidatePipelineIdsInteractor,
  ) {
    super();
  }

  @Write({
    input: DeletePipelineSchema,
    output: z.string(),
    precheck: (self, data, ctx) => self.validator.invoke([{ ids: data.id, path: ["id"] }], ctx),
  })
  async invoke(data: DeletePipelineData): Validated<string> {
    const pipeline = await this.repo.getOrThrowCompanyWide(data.id);
    if (pipeline.isDefault) return failConflict(CustomErrorCode.pipelineDefaultRequired, ["id"]);

    const dealCount = await this.repo.countDealsInPipeline(data.id);
    if (dealCount > 0) return failConflict(CustomErrorCode.pipelineHasDeals, ["id"], { count: dealCount });

    await this.repo.deletePipelineOrThrow(data.id);

    return { ok: true as const, data: data.id };
  }
}
