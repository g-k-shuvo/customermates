import type { Validated } from "@/core/validation/validation.utils";

import { Resource, Action } from "@/generated/prisma";

import { type LostReasonDto, LostReasonDtoSchema } from "../lost-reason.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export abstract class GetLostReasonsRepo {
  abstract getLostReasons(): Promise<LostReasonDto[]>;
}

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.company, action: Action.readAll },
    { resource: Resource.company, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetLostReasonsInteractor extends AuthenticatedInteractor<void, LostReasonDto[]> {
  constructor(private repo: GetLostReasonsRepo) {
    super();
  }

  @ValidateOutput(LostReasonDtoSchema)
  async invoke(): Validated<LostReasonDto[]> {
    const lostReasons = await this.repo.getLostReasons();

    return { ok: true as const, data: lostReasons };
  }
}
