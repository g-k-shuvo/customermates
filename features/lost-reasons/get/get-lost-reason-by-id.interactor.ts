import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { type LostReasonDto, LostReasonDtoSchema } from "../lost-reason.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export const GetLostReasonByIdSchema = z.object({
  id: z.uuid(),
});
export type GetLostReasonByIdData = Data<typeof GetLostReasonByIdSchema>;

export abstract class GetLostReasonByIdRepo {
  abstract getLostReasonById(id: string): Promise<LostReasonDto | null>;
}

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.company, action: Action.readAll },
    { resource: Resource.company, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetLostReasonByIdInteractor extends AuthenticatedInteractor<GetLostReasonByIdData, LostReasonDto | null> {
  constructor(private repo: GetLostReasonByIdRepo) {
    super();
  }

  @Validate(GetLostReasonByIdSchema)
  @ValidateOutput(LostReasonDtoSchema.nullable())
  async invoke(data: GetLostReasonByIdData): Validated<LostReasonDto | null> {
    const lostReason = await this.repo.getLostReasonById(data.id);

    return { ok: true as const, data: lostReason };
  }
}
