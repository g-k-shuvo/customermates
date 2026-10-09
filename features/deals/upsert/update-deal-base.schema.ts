import { z } from "zod";

import { CustomFieldValueInputSchema, NotesSchema } from "@/core/base/base-entity.schema";
import { zx } from "@/core/validation/validation.utils";
import { moneyAmount } from "@/core/validation/money-amount";

export const BaseUpdateDealSchema = z.object({
  id: z.uuid(),
  name: zx.nonBlankText(255).optional(),
  notes: NotesSchema,
  pipelineId: z.uuid().nullish(),
  stageId: z.uuid().nullish(),
  expectedCloseDate: zx.isoDateTime().nullish(),
  probability: z.number().min(0).max(100).nullish(),
  baseValue: moneyAmount()
    .optional()
    .describe("The deal's own value on top of its service lines. The total is recalculated."),
  organizationIds: z.array(z.uuid()).nullish(),
  userIds: z.array(z.uuid()).nullish(),
  contactIds: z.array(z.uuid()).nullish(),
  services: z
    .array(
      z.object({
        serviceId: z.uuid(),
        quantity: z.number().min(0).default(1),
      }),
    )
    .nullable()
    .optional(),
  taskIds: z.array(z.uuid()).nullish(),
  customFieldValues: z.array(CustomFieldValueInputSchema).nullish(),
});
