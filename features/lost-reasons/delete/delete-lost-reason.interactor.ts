import type { DeleteLostReasonRepo } from "./delete-lost-reason.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { ValidateLostReasonIdsInteractor } from "@/core/validation/validators/validate-lost-reason-ids.interactor";

import { Resource, Action } from "@/generated/prisma";
import { z } from "zod";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { failConflict } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

export const DeleteLostReasonSchema = z.object({
  id: z.uuid(),
});
export type DeleteLostReasonData = Data<typeof DeleteLostReasonSchema>;

@TenantInteractor({ resource: Resource.company, action: Action.update })
export class DeleteLostReasonInteractor extends AuthenticatedInteractor<DeleteLostReasonData, string> {
  constructor(
    private repo: DeleteLostReasonRepo,
    private validator: ValidateLostReasonIdsInteractor,
  ) {
    super();
  }

  @Write({
    input: DeleteLostReasonSchema,
    output: z.string(),
    precheck: (self, data, ctx) => self.validator.invoke([{ ids: data.id, path: ["id"] }], ctx),
  })
  async invoke(data: DeleteLostReasonData): Validated<string> {
    const dealCount = await this.repo.countDealsWithLostReason(data.id);
    if (dealCount > 0) return failConflict(CustomErrorCode.lostReasonHasDeals, ["id"], { count: dealCount });

    await this.repo.deleteLostReasonOrThrow(data.id);

    return { ok: true as const, data: data.id };
  }
}
