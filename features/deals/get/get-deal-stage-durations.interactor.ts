import type { Data, Validated } from "@/core/validation/validation.utils";
import type { GetDealStageDurationsRepo } from "./get-deal-stage-durations.repo";

import { z } from "zod";
import { Action, Resource } from "@/generated/prisma";

import { type DealStageDurationsDto, DealStageDurationsDtoSchema } from "../deal-stage-durations.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

export const GetDealStageDurationsSchema = z.object({
  id: z.uuid(),
});
export type GetDealStageDurationsData = Data<typeof GetDealStageDurationsSchema>;

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.deals, action: Action.readAll },
    { resource: Resource.deals, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetDealStageDurationsInteractor extends AuthenticatedInteractor<
  GetDealStageDurationsData,
  DealStageDurationsDto
> {
  constructor(private repo: GetDealStageDurationsRepo) {
    super();
  }

  @Validate(GetDealStageDurationsSchema)
  @ValidateOutput(DealStageDurationsDtoSchema)
  async invoke(data: GetDealStageDurationsData): Validated<DealStageDurationsDto> {
    const durations = await this.repo.getDealStageDurations(data.id, new Date());

    if (!durations) return failNotFound(CustomErrorCode.dealNotFound, ["id"]);

    return { ok: true as const, data: durations };
  }
}
