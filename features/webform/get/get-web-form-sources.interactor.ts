import type { Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { type WebFormSourceList, WebFormSourceListSchema } from "../webform-source.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export const GetWebFormSourcesSchema = z.object({});
export type GetWebFormSourcesData = z.infer<typeof GetWebFormSourcesSchema>;

export abstract class GetWebFormSourcesRepo {
  abstract getWebFormSources(): Promise<WebFormSourceList>;
}

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.leads, action: Action.readAll },
    { resource: Resource.leads, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetWebFormSourcesInteractor extends AuthenticatedInteractor<GetWebFormSourcesData, WebFormSourceList> {
  constructor(private repo: GetWebFormSourcesRepo) {
    super();
  }

  @Validate(GetWebFormSourcesSchema)
  @ValidateOutput(WebFormSourceListSchema)
  async invoke(_data: GetWebFormSourcesData): Validated<WebFormSourceList> {
    return { ok: true as const, data: await this.repo.getWebFormSources() };
  }
}
