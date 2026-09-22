import type { RotateWebFormSecretRepo } from "./rotate-web-form-secret.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { type WebFormSourceWithSecret, WebFormSourceWithSecretSchema } from "../webform-source.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

export const RotateWebFormSecretSchema = z.object({
  id: z.uuid(),
});
export type RotateWebFormSecretData = Data<typeof RotateWebFormSecretSchema>;

@TenantInteractor({
  resource: Resource.leads,
  action: Action.update,
})
export class RotateWebFormSecretInteractor extends AuthenticatedInteractor<
  RotateWebFormSecretData,
  WebFormSourceWithSecret
> {
  constructor(private repo: RotateWebFormSecretRepo) {
    super();
  }

  @Write({
    input: RotateWebFormSecretSchema,
    output: WebFormSourceWithSecretSchema,
  })
  async invoke(data: RotateWebFormSecretData): Validated<WebFormSourceWithSecret> {
    return { ok: true as const, data: await this.repo.rotateWebFormSecretOrThrow(data.id) };
  }
}
