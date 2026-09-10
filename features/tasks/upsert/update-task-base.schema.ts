import { z } from "zod";
import { ActivityKind } from "@/generated/prisma";

import { CustomFieldValueInputSchema, NotesSchema } from "@/core/base/base-entity.schema";
import { zx } from "@/core/validation/validation.utils";

export const BaseUpdateTaskSchema = z.object({
  id: z.uuid(),
  name: zx.nonBlankText(255).optional(),
  notes: NotesSchema,
  activityKind: z.enum(ActivityKind).nullish(),
  dueAt: zx.isoDateTime().nullish(),
  durationMinutes: z.number().int().min(1).nullish(),
  userIds: z.array(z.uuid()).nullish(),
  contactIds: z.array(z.uuid()).nullish(),
  organizationIds: z.array(z.uuid()).nullish(),
  dealIds: z.array(z.uuid()).nullish(),
  serviceIds: z.array(z.uuid()).nullish(),
  customFieldValues: z.array(CustomFieldValueInputSchema).nullish(),
});
