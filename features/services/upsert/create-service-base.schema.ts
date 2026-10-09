import { z } from "zod";

import { CustomFieldValueInputSchema, NotesSchema } from "@/core/base/base-entity.schema";
import { zx } from "@/core/validation/validation.utils";
import { positiveMoneyAmount } from "@/core/validation/money-amount";

export const BaseCreateServiceSchema = z.object({
  name: zx.nonBlankText(255),
  amount: positiveMoneyAmount(),
  notes: NotesSchema,
  userIds: z.array(z.uuid()).optional().default([]),
  dealIds: z.array(z.uuid()).optional().default([]),
  taskIds: z.array(z.uuid()).optional().default([]),
  customFieldValues: z.array(CustomFieldValueInputSchema).optional().default([]),
});
