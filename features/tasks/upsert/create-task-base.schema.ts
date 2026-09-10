import { z } from "zod";
import { ActivityKind } from "@/generated/prisma";

import { CustomFieldValueInputSchema, NotesSchema } from "@/core/base/base-entity.schema";
import { zx } from "@/core/validation/validation.utils";

export const BaseCreateTaskSchema = z.object({
  name: zx.nonBlankText(255),
  notes: NotesSchema,
  activityKind: z.enum(ActivityKind).optional(),
  dueAt: zx.isoDateTime().optional(),
  durationMinutes: z.number().int().min(1).optional(),
  userIds: z.array(z.uuid()).optional().default([]),
  contactIds: z.array(z.uuid()).optional().default([]),
  organizationIds: z.array(z.uuid()).optional().default([]),
  dealIds: z.array(z.uuid()).optional().default([]),
  serviceIds: z.array(z.uuid()).optional().default([]),
  customFieldValues: z.array(CustomFieldValueInputSchema).optional().default([]),
});
