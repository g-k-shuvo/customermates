import type { z } from "zod";

import { CustomErrorCode } from "@/core/validation/validation.types";

export type StageDeletionConflict = {
  code: CustomErrorCode.pipelineStageHasDeals;
  dealCount: number;
};

export function stageDeletionConflict(error: z.ZodError): StageDeletionConflict | undefined {
  for (const issue of error.issues) {
    if (issue.code !== "custom") continue;
    if (issue.params?.error !== CustomErrorCode.pipelineStageHasDeals) continue;

    const dealCount = issue.params?.count;
    if (typeof dealCount !== "number") continue;

    return { code: CustomErrorCode.pipelineStageHasDeals, dealCount };
  }

  return undefined;
}
