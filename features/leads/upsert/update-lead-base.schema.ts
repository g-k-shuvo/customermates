import { z } from "zod";
import { LeadStatus } from "@/generated/prisma";

import { CustomFieldValueInputSchema, NotesSchema } from "@/core/base/base-entity.schema";
import { zx } from "@/core/validation/validation.utils";
import { moneyAmount } from "@/core/validation/money-amount";

export const BaseUpdateLeadSchema = z.object({
  id: z.uuid(),
  title: zx.nonBlankText(255).optional(),
  status: z.enum(LeadStatus).optional(),
  sourceOrigin: zx.nonBlankText(64).optional(),
  sourceId: z.uuid().nullish(),
  contactId: z.uuid().nullish(),
  organizationId: z.uuid().nullish(),
  ownerUserId: z.uuid().nullish(),
  labels: z.array(zx.nonBlankText(64)).optional(),
  value: moneyAmount().nullish(),
  notes: NotesSchema,
  customFieldValues: z.array(CustomFieldValueInputSchema).optional(),
});
