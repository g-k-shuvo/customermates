import { z } from "zod";
import { StageKind } from "@/generated/prisma";

import { zx } from "@/core/validation/validation.utils";

export const CreatePipelineStageInputSchema = z.object({
  name: zx.nonBlankText(255),
  probability: z.number().min(0).max(100).optional().default(0),
  rottingDays: z.number().int().min(1).nullable().optional().default(null),
  kind: z.enum(StageKind).optional().default(StageKind.open),
});

export const BaseCreatePipelineSchema = z.object({
  name: zx.nonBlankText(255),
  position: z.number().int().min(0).optional().default(0),
  isDefault: z.boolean().optional().default(false),
  stages: z.array(CreatePipelineStageInputSchema).min(1),
});
