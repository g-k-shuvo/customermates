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
