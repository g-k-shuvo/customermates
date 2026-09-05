import { z } from "zod";

import { zx } from "@/core/validation/validation.utils";

export const BaseUpdateLostReasonSchema = z.object({
  id: z.uuid(),
  name: zx.nonBlankText(255).optional(),
  position: z.number().int().min(0).optional(),
  archivedAt: z.coerce.date().nullable().optional(),
});
