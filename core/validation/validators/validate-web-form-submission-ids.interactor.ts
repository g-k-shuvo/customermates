import type { z } from "zod";

import type { FindWebFormSubmissionsByIdsRepo } from "@/features/webform/submissions/find-web-form-submissions-by-ids.repo";
import type { IdEntry } from "./check-ids";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { checkIds } from "./check-ids";

export class ValidateWebFormSubmissionIdsInteractor {
  constructor(private repo: FindWebFormSubmissionsByIdsRepo) {}
  invoke(entries: IdEntry[], ctx: z.RefinementCtx) {
    return checkIds(entries, ctx, (ids) => this.repo.findIds(ids), CustomErrorCode.webFormSubmissionNotFound);
  }
}
