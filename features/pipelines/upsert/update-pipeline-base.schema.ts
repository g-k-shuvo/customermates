import { z } from "zod";

import { zx } from "@/core/validation/validation.utils";

export const BaseUpdatePipelineSchema = z.object({
  id: z.uuid(),
  name: zx.nonBlankText(255).optional(),
  position: z.number().int().min(0).optional(),
  isDefault: z.boolean().optional(),
  archivedAt: z.coerce.date().nullable().optional(),
});
