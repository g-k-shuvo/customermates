import type { z } from "zod";

import type { ValidateUserIdsInteractor } from "@/core/validation/validators/validate-user-ids.interactor";
import type { ValidateWebFormSourceIdsInteractor } from "@/core/validation/validators/validate-web-form-source-ids.interactor";
import type { UpdateWebFormSourceData } from "./update-web-form-source.interactor";
import type { DeleteWebFormSourceData } from "../delete/delete-web-form-source.interactor";

export class WebFormSourceWritePrecheckInteractor {
  constructor(
    private sourceValidator: ValidateWebFormSourceIdsInteractor,
    private userValidator: ValidateUserIdsInteractor,
  ) {}

  async update(data: UpdateWebFormSourceData, ctx: z.RefinementCtx) {
    await Promise.all([
      this.sourceValidator.invoke([{ ids: data.id, path: ["id"] }], ctx),
      this.userValidator.invoke([{ ids: data.defaultOwnerId, path: ["defaultOwnerId"] }], ctx),
    ]);
  }

  async delete(data: DeleteWebFormSourceData, ctx: z.RefinementCtx) {
    await this.sourceValidator.invoke([{ ids: data.id, path: ["id"] }], ctx);
  }
}
