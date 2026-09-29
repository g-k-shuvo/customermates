import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { BulkJobKind, BulkJobStatus } from "@/generated/prisma";

export const BulkJobDtoSchema = z.object({
  id: z.uuid(),
  kind: z.enum(BulkJobKind),
  status: z.enum(BulkJobStatus),
  subjectId: z.uuid(),
  processed: z.number().int(),
  expectedTotal: z.number().int().nullable(),
  finalTotal: z.number().int().nullable(),
  stale: z.boolean(),
  error: z.string().nullable(),
  startedAt: z.date(),
  finishedAt: z.date().nullable(),
});
export type BulkJobDto = Data<typeof BulkJobDtoSchema>;

export const BulkJobIdSchema = z.object({ id: z.uuid() });
export type BulkJobIdData = Data<typeof BulkJobIdSchema>;

export const BulkJobPageSchema = z.object({ jobId: z.uuid(), cursor: z.string().nullable() });
export type BulkJobPageData = Data<typeof BulkJobPageSchema>;
