import type { z } from "zod";

import type { FindPipelinesByIdsRepo } from "@/features/pipelines/find-pipelines-by-ids.repo";
import type { IdEntry } from "./check-ids";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { checkIds } from "./check-ids";

export class ValidatePipelineIdsInteractor {
  constructor(private repo: FindPipelinesByIdsRepo) {}
  invoke(entries: IdEntry[], ctx: z.RefinementCtx) {
    return checkIds(entries, ctx, (ids) => this.repo.findIds(ids), CustomErrorCode.pipelineNotFound);
  }
}
