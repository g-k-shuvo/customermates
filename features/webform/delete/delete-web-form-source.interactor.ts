import type { DeleteWebFormSourceRepo } from "./delete-web-form-source.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { WebFormSourceWritePrecheckInteractor } from "../upsert/web-form-source-write-precheck.interactor";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

export const DeleteWebFormSourceSchema = z.object({
  id: z.uuid(),
});
export type DeleteWebFormSourceData = Data<typeof DeleteWebFormSourceSchema>;

@TenantInteractor({ resource: Resource.leads, action: Action.delete })
export class DeleteWebFormSourceInteractor extends AuthenticatedInteractor<DeleteWebFormSourceData, string> {
  constructor(
    private repo: DeleteWebFormSourceRepo,
    private precheck: WebFormSourceWritePrecheckInteractor,
  ) {
    super();
  }

  @Write({
    input: DeleteWebFormSourceSchema,
    output: z.string(),
    precheck: (self, data, ctx) => self.precheck.delete(data, ctx),
  })
  async invoke(data: DeleteWebFormSourceData): Validated<string> {
    return { ok: true as const, data: await this.repo.deleteWebFormSourceOrThrow(data.id) };
  }
}
