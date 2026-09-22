import type { CreateWebFormSourceRepo } from "./create-web-form-source.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import {
  type WebFormSourceWithSecret,
  WebFormSourceWithSecretSchema,
  WEBFORM_SLUG_PATTERN,
} from "../webform-source.schema";
import { WebFormFieldMappingSchema } from "../ingest/field-mapping";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { zx } from "@/core/validation/validation.utils";

export const CreateWebFormSourceSchema = z.object({
  name: zx.nonBlankText(120),
  slug: z.string().trim().min(1).max(64).regex(WEBFORM_SLUG_PATTERN),
  active: z.boolean().optional().default(true),
  defaultOwnerId: z.uuid().optional(),
  defaultLabels: z.array(zx.nonBlankText(64)).optional().default([]),
  fieldMapping: WebFormFieldMappingSchema.optional().default({}),
});
export type CreateWebFormSourceData = Data<typeof CreateWebFormSourceSchema>;

@TenantInteractor({
  resource: Resource.leads,
  action: Action.create,
})
export class CreateWebFormSourceInteractor extends AuthenticatedInteractor<
  CreateWebFormSourceData,
  WebFormSourceWithSecret
> {
  constructor(private repo: CreateWebFormSourceRepo) {
    super();
  }

  @Write({
    input: CreateWebFormSourceSchema,
    output: WebFormSourceWithSecretSchema,
    precheck: (self, data, ctx) => self.precheck(data, ctx),
  })
  async invoke(data: CreateWebFormSourceData): Validated<WebFormSourceWithSecret> {
    return { ok: true as const, data: await this.repo.createWebFormSourceOrThrow(data) };
  }

  private async precheck(data: CreateWebFormSourceData, ctx: z.RefinementCtx) {
    if (await this.repo.slugExists(data.slug))
      ctx.addIssue({ code: "custom", params: { error: CustomErrorCode.webFormSourceSlugTaken }, path: ["slug"] });
  }
}
