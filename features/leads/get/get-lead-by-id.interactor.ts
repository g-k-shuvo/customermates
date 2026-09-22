import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action, EntityType } from "@/generated/prisma";

import { type LeadDto, type LeadByIdResponse, LeadByIdResponseSchema } from "../lead.schema";

import { type CustomColumnDto } from "@/features/custom-column/custom-column.schema";
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

export abstract class LeadCustomColumnRepo {
  abstract findByEntityType(entityType: EntityType): Promise<CustomColumnDto[]>;
}

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.leads, action: Action.readAll },
    { resource: Resource.leads, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetLeadByIdInteractor extends AuthenticatedInteractor<GetLeadByIdData, LeadByIdResponse> {
  constructor(
    private repo: GetLeadByIdRepo,
    private customColumnsRepo: LeadCustomColumnRepo,
  ) {
    super();
  }

  @Validate(GetLeadByIdSchema)
  @ValidateOutput(LeadByIdResponseSchema)
  async invoke(data: GetLeadByIdData): Validated<LeadByIdResponse> {
    const [lead, customColumns] = await Promise.all([
      this.repo.getLeadById(data.id),
      this.customColumnsRepo.findByEntityType(EntityType.lead),
    ]);

    return { ok: true as const, data: { lead, customColumns } };
  }
}
