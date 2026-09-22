import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { WebFormFieldMappingSchema } from "./ingest/field-mapping";

export const WEBFORM_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const WebFormSourceDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  active: z.boolean(),
  defaultOwnerId: z.uuid().nullable(),
  defaultLabels: z.array(z.string()),
  fieldMapping: WebFormFieldMappingSchema,
  endpointPath: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type WebFormSourceDto = Data<typeof WebFormSourceDtoSchema>;

export const WebFormSourceWithSecretSchema = WebFormSourceDtoSchema.extend({
  signingSecret: z
    .string()
    .describe("Shown once, when the source is created or its secret is rotated. It is not returned again."),
});

export type WebFormSourceWithSecret = Data<typeof WebFormSourceWithSecretSchema>;

export const WebFormSourceListSchema = z.object({
  sources: z.array(WebFormSourceDtoSchema),
});

export type WebFormSourceList = Data<typeof WebFormSourceListSchema>;
