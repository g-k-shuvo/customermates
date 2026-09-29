import type { MergeFailure } from "@/features/messaging-send/render/merge-fields";

import { fail } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

export function failMerge(failure: MergeFailure, path: string) {
  switch (failure.code) {
    case "unknownMergeField":
      return fail(CustomErrorCode.mergeFieldUnknown, [path], { field: failure.field });
    case "malformedMergeField":
      return fail(CustomErrorCode.mergeFieldMalformed, [path], { field: failure.field });
    case "missingMergeValue":
      return fail(CustomErrorCode.mergeValueMissing, [path], { field: failure.field });
  }
}
