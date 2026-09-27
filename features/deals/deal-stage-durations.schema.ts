import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { StageKind } from "@/generated/prisma";

export const DealStageDurationSchema = z.object({
  stageId: z.uuid(),
  name: z.string(),
  position: z.number().int(),
  kind: z.enum(StageKind),
  durationSeconds: z
    .number()
    .int()
    .min(0)
    .describe(
      "Total time the deal has spent in this stage, in seconds: every closed visit from its stage history plus the open visit, measured up to measuredAt. 0 for a stage the deal never entered.",
    ),
  visits: z.number().int().min(0).describe("How many times the deal entered this stage."),
  isCurrent: z.boolean().describe("Whether the deal is in this stage now."),
  lastEnteredAt: z.date().nullable().describe("When the deal last entered this stage. Null when it never did."),
});

export type DealStageDurationDto = Data<typeof DealStageDurationSchema>;

export const DealStageDurationsDtoSchema = z.object({
  dealId: z.uuid(),
  pipelineId: z.uuid().nullable(),
  currentStageId: z.uuid().nullable(),
  measuredAt: z.date().describe("The moment the open visit of the current stage was measured to."),
  stages: z
    .array(DealStageDurationSchema)
    .describe(
      "Every stage of the deal's pipeline in pipeline order, including the stages the deal never entered. Empty when the deal has no pipeline.",
    ),
});

export type DealStageDurationsDto = Data<typeof DealStageDurationsDtoSchema>;
