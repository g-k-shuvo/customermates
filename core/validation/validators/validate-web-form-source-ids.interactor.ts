import type { z } from "zod";

import type { FindWebFormSourcesByIdsRepo } from "@/features/webform/find-web-form-sources-by-ids.repo";
import type { IdEntry } from "./check-ids";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { checkIds } from "./check-ids";

export class ValidateWebFormSourceIdsInteractor {
  constructor(private repo: FindWebFormSourcesByIdsRepo) {}
  invoke(entries: IdEntry[], ctx: z.RefinementCtx) {
    return checkIds(entries, ctx, (ids) => this.repo.findIds(ids), CustomErrorCode.webFormSourceNotFound);
  }
}
