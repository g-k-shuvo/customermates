import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action, LeadStatus } from "@/generated/prisma";

import { type LeadListResponse, LeadListResponseSchema } from "../lead.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export const GetLeadsSchema = z.object({
  status: z.enum(LeadStatus).optional(),
  ownerUserId: z.uuid().optional(),
  sourceId: z.uuid().optional(),
  skip: z.number().int().min(0).optional().default(0),
  take: z.number().int().min(1).max(200).optional().default(50),
});
export type GetLeadsData = Data<typeof GetLeadsSchema>;

export abstract class GetLeadsRepo {
  abstract getLeads(args: GetLeadsData): Promise<LeadListResponse>;
}

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.leads, action: Action.readAll },
    { resource: Resource.leads, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetLeadsInteractor extends AuthenticatedInteractor<GetLeadsData, LeadListResponse> {
  constructor(private repo: GetLeadsRepo) {
    super();
  }

  @Validate(GetLeadsSchema)
  @ValidateOutput(LeadListResponseSchema)
  async invoke(data: GetLeadsData): Validated<LeadListResponse> {
    return { ok: true as const, data: await this.repo.getLeads(data) };
  }
}
