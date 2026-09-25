import type { AutomationStepData } from "./automation-action.schema";
import type { EntityType } from "@/generated/prisma";
import type { z as zType } from "zod";

import { ACTION_ENTITY_SUPPORT } from "./automation-action.schema";
import { CustomErrorCode } from "@/core/validation/validation.types";

export function actionSupportsEntity(kind: AutomationStepData["kind"], entityType: EntityType | null): boolean {
  const supported = ACTION_ENTITY_SUPPORT[kind];
  if (supported === null) return true;
  if (!entityType) return false;

  return supported.includes(entityType);
}

export function assertActionsFitEntity(
  steps: readonly AutomationStepData[],
  entityType: EntityType | null,
  ctx: zType.RefinementCtx,
): void {
  steps.forEach((step, index) => {
    if (actionSupportsEntity(step.kind, entityType)) return;

    ctx.addIssue({
      code: "custom",
      path: ["steps", index, "kind"],
      params: { error: CustomErrorCode.automationActionNotAvailableForEntity },
    });
  });
}
