import type { UpdateWebFormSourceRepo } from "./update-web-form-source.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { WebFormSourceWritePrecheckInteractor } from "./web-form-source-write-precheck.interactor";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { type WebFormSourceDto, WebFormSourceDtoSchema } from "../webform-source.schema";
import { WebFormFieldMappingSchema } from "../ingest/field-mapping";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { zx } from "@/core/validation/validation.utils";

export const UpdateWebFormSourceSchema = z.object({
  id: z.uuid(),
  name: zx.nonBlankText(120).optional(),
  active: z.boolean().optional(),
  defaultOwnerId: z.uuid().nullish(),
  defaultLabels: z.array(zx.nonBlankText(64)).optional(),
  fieldMapping: WebFormFieldMappingSchema.optional(),
});
export type UpdateWebFormSourceData = Data<typeof UpdateWebFormSourceSchema>;

@TenantInteractor({
  resource: Resource.leads,
  action: Action.update,
})
export class UpdateWebFormSourceInteractor extends AuthenticatedInteractor<UpdateWebFormSourceData, WebFormSourceDto> {
  constructor(
    private repo: UpdateWebFormSourceRepo,
    private precheck: WebFormSourceWritePrecheckInteractor,
  ) {
    super();
  }

  @Write({
    input: UpdateWebFormSourceSchema,
    output: WebFormSourceDtoSchema,
    precheck: (self, data, ctx) => self.precheck.update(data, ctx),
  })
  async invoke(data: UpdateWebFormSourceData): Validated<WebFormSourceDto> {
    return { ok: true as const, data: await this.repo.updateWebFormSourceOrThrow(data) };
  }
}
