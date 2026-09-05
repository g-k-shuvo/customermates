import type { z } from "zod";

import type { FindLostReasonsByIdsRepo } from "@/features/lost-reasons/find-lost-reasons-by-ids.repo";
import type { IdEntry } from "./check-ids";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { checkIds } from "./check-ids";

export class ValidateLostReasonIdsInteractor {
  constructor(private repo: FindLostReasonsByIdsRepo) {}
  invoke(entries: IdEntry[], ctx: z.RefinementCtx) {
    return checkIds(entries, ctx, (ids) => this.repo.findIds(ids), CustomErrorCode.lostReasonNotFound);
  }
}
