import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { StageKind } from "@/generated/prisma";

export const PipelineStageDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  position: z.number(),
  probability: z.number().min(0).max(100),
  rottingDays: z.number().int().nullable(),
  kind: z.enum(StageKind),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type PipelineStageDto = Data<typeof PipelineStageDtoSchema>;

export const PipelineDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  position: z.number(),
  isDefault: z.boolean(),
  archivedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  stages: z.array(PipelineStageDtoSchema),
});

export type PipelineDto = Data<typeof PipelineDtoSchema>;
