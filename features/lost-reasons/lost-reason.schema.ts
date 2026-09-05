import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

export const LostReasonDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  position: z.number(),
  archivedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type LostReasonDto = Data<typeof LostReasonDtoSchema>;
