import type { z } from "zod";

import type { ValidateUserIdsInteractor } from "@/core/validation/validators/validate-user-ids.interactor";
import type { ValidateWebFormSourceIdsInteractor } from "@/core/validation/validators/validate-web-form-source-ids.interactor";
import type { CreateWebFormSourceData } from "./create-web-form-source.interactor";
import type { UpdateWebFormSourceData } from "./update-web-form-source.interactor";
import type { DeleteWebFormSourceData } from "../delete/delete-web-form-source.interactor";
import type { FindWebFormMappableColumnsRepo } from "./find-web-form-mappable-columns.repo";
import type { WebFormFieldMapping } from "../ingest/field-mapping";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { checkIds } from "@/core/validation/validators/check-ids";

export class WebFormSourceWritePrecheckInteractor {
  constructor(
    private sourceValidator: ValidateWebFormSourceIdsInteractor,
    private userValidator: ValidateUserIdsInteractor,
    private columnsRepo: FindWebFormMappableColumnsRepo,
  ) {}

  private checkMappedColumns(mapping: WebFormFieldMapping | undefined, ctx: z.RefinementCtx) {
    const entries = (mapping?.customFields ?? []).map((field, index) => ({
      ids: field.columnId,
      path: ["fieldMapping", "customFields", index, "columnId"],
    }));

    return checkIds(
      entries,
      ctx,
      (ids) => this.columnsRepo.findMappableColumnIds(ids),
      CustomErrorCode.customColumnIdNotFound,
    );
  }

  async create(data: CreateWebFormSourceData, ctx: z.RefinementCtx) {
    await Promise.all([
      this.userValidator.invoke([{ ids: data.defaultOwnerId, path: ["defaultOwnerId"] }], ctx),
      this.checkMappedColumns(data.fieldMapping, ctx),
    ]);
  }

  async update(data: UpdateWebFormSourceData, ctx: z.RefinementCtx) {
    await Promise.all([
      this.sourceValidator.invoke([{ ids: data.id, path: ["id"] }], ctx),
      this.userValidator.invoke([{ ids: data.defaultOwnerId, path: ["defaultOwnerId"] }], ctx),
      this.checkMappedColumns(data.fieldMapping, ctx),
    ]);
  }

  async delete(data: DeleteWebFormSourceData, ctx: z.RefinementCtx) {
    await this.sourceValidator.invoke([{ ids: data.id, path: ["id"] }], ctx);
  }
}
