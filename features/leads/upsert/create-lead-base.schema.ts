import { z } from "zod";
import { LeadStatus } from "@/generated/prisma";

import { CustomFieldValueInputSchema, NotesSchema } from "@/core/base/base-entity.schema";
import { zx } from "@/core/validation/validation.utils";

export const BaseCreateLeadSchema = z.object({
  title: zx.nonBlankText(255),
  status: z.enum(LeadStatus).optional().default(LeadStatus.new),
  sourceOrigin: zx.nonBlankText(64).optional().default("manual"),
  sourceId: z.uuid().optional(),
  contactId: z.uuid().optional(),
  organizationId: z.uuid().optional(),
  ownerUserId: z.uuid().optional(),
  labels: z.array(zx.nonBlankText(64)).optional().default([]),
  value: z.number().min(0).optional(),
  notes: NotesSchema,
  customFieldValues: z.array(CustomFieldValueInputSchema).optional().default([]),
});
