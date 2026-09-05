import type { CreateLostReasonRepo } from "./create-lost-reason.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { Resource, Action } from "@/generated/prisma";

import { type LostReasonDto, LostReasonDtoSchema } from "../lost-reason.schema";

import { BaseCreateLostReasonSchema } from "./create-lost-reason-base.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

export const CreateLostReasonSchema = BaseCreateLostReasonSchema;
export type CreateLostReasonData = Data<typeof CreateLostReasonSchema>;

@TenantInteractor({
  resource: Resource.company,
  action: Action.update,
})
export class CreateLostReasonInteractor extends AuthenticatedInteractor<CreateLostReasonData, LostReasonDto> {
  constructor(private repo: CreateLostReasonRepo) {
    super();
  }

  @Write({
    input: CreateLostReasonSchema,
    output: LostReasonDtoSchema,
  })
  async invoke(data: CreateLostReasonData): Validated<LostReasonDto> {
    const lostReason = await this.repo.createLostReasonOrThrow(data);

    return { ok: true as const, data: lostReason };
  }
}
