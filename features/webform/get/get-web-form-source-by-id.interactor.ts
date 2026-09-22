import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { type WebFormSourceDto, WebFormSourceDtoSchema } from "../webform-source.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export const GetWebFormSourceByIdSchema = z.object({
  id: z.uuid(),
});
export type GetWebFormSourceByIdData = Data<typeof GetWebFormSourceByIdSchema>;

export abstract class GetWebFormSourceByIdRepo {
  abstract getWebFormSourceById(id: string): Promise<WebFormSourceDto | null>;
}

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.leads, action: Action.readAll },
    { resource: Resource.leads, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetWebFormSourceByIdInteractor extends AuthenticatedInteractor<
  GetWebFormSourceByIdData,
  WebFormSourceDto | null
> {
  constructor(private repo: GetWebFormSourceByIdRepo) {
    super();
  }

  @Validate(GetWebFormSourceByIdSchema)
  @ValidateOutput(WebFormSourceDtoSchema.nullable())
  async invoke(data: GetWebFormSourceByIdData): Validated<WebFormSourceDto | null> {
    return { ok: true as const, data: await this.repo.getWebFormSourceById(data.id) };
  }
}
