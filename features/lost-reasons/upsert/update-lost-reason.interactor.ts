import type { UpdateLostReasonRepo } from "./update-lost-reason.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { ValidateLostReasonIdsInteractor } from "@/core/validation/validators/validate-lost-reason-ids.interactor";

import { Resource, Action } from "@/generated/prisma";

import { type LostReasonDto, LostReasonDtoSchema } from "../lost-reason.schema";

import { BaseUpdateLostReasonSchema } from "./update-lost-reason-base.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

export const UpdateLostReasonSchema = BaseUpdateLostReasonSchema;
export type UpdateLostReasonData = Data<typeof UpdateLostReasonSchema>;

@TenantInteractor({
  resource: Resource.company,
  action: Action.update,
})
export class UpdateLostReasonInteractor extends AuthenticatedInteractor<UpdateLostReasonData, LostReasonDto> {
  constructor(
    private repo: UpdateLostReasonRepo,
    private validator: ValidateLostReasonIdsInteractor,
  ) {
    super();
  }

  @Write({
    input: UpdateLostReasonSchema,
    output: LostReasonDtoSchema,
    precheck: (self, data, ctx) => self.validator.invoke([{ ids: data.id, path: ["id"] }], ctx),
  })
  async invoke(data: UpdateLostReasonData): Validated<LostReasonDto> {
    const lostReason = await this.repo.updateLostReasonOrThrow(data);

    return { ok: true as const, data: lostReason };
  }
}
