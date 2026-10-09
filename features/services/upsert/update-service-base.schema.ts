import { z } from "zod";

import { CustomFieldValueInputSchema, NotesSchema } from "@/core/base/base-entity.schema";
import { zx } from "@/core/validation/validation.utils";
import { positiveMoneyAmount } from "@/core/validation/money-amount";

export const BaseUpdateServiceSchema = z.object({
  id: z.uuid(),
  name: zx.nonBlankText(255).optional(),
  amount: positiveMoneyAmount().optional(),
  notes: NotesSchema,
  userIds: z.array(z.uuid()).nullish(),
  dealIds: z.array(z.uuid()).nullish(),
  taskIds: z.array(z.uuid()).nullish(),
  customFieldValues: z.array(CustomFieldValueInputSchema).nullish(),
});
