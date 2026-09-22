import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { type LeadDto, LeadDtoSchema } from "../lead.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export const GetLeadByIdSchema = z.object({
  id: z.uuid(),
});
export type GetLeadByIdData = Data<typeof GetLeadByIdSchema>;

export abstract class GetLeadByIdRepo {
  abstract getLeadById(id: string): Promise<LeadDto | null>;
}

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.leads, action: Action.readAll },
    { resource: Resource.leads, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetLeadByIdInteractor extends AuthenticatedInteractor<GetLeadByIdData, LeadDto | null> {
  constructor(private repo: GetLeadByIdRepo) {
    super();
  }

  @Validate(GetLeadByIdSchema)
  @ValidateOutput(LeadDtoSchema.nullable())
  async invoke(data: GetLeadByIdData): Validated<LeadDto | null> {
    return { ok: true as const, data: await this.repo.getLeadById(data.id) };
  }
}
