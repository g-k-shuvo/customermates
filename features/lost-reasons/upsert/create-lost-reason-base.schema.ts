import { z } from "zod";

import { zx } from "@/core/validation/validation.utils";

export const BaseCreateLostReasonSchema = z.object({
  name: zx.nonBlankText(255),
  position: z.number().int().min(0).optional().default(0),
});
