import { z } from "zod";

import { CustomFieldValueInputSchema, NotesSchema } from "@/core/base/base-entity.schema";
import { zx } from "@/core/validation/validation.utils";

export const BaseCreateDealSchema = z.object({
  name: zx.nonBlankText(255),
  notes: NotesSchema,
  pipelineId: z.uuid().optional(),
  stageId: z.uuid().optional(),
  expectedCloseDate: zx.isoDateTime().optional(),
  probability: z.number().min(0).max(100).optional(),
  baseValue: z.number().min(0).optional().describe("The deal's own value on top of its service lines. Defaults to 0."),
  organizationIds: z.array(z.uuid()).optional().default([]),
  userIds: z.array(z.uuid()).optional().default([]),
  contactIds: z.array(z.uuid()).optional().default([]),
  services: z
    .array(
      z.object({
        serviceId: z.uuid(),
        quantity: z.number().min(0).default(1),
      }),
    )
    .optional()
    .default([]),
  taskIds: z.array(z.uuid()).optional().default([]),
  customFieldValues: z.array(CustomFieldValueInputSchema).optional().default([]),
});
