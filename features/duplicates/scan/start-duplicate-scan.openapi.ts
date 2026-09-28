import type { ZodOpenApiOperationObject } from "zod-openapi";

import { DuplicateScanDtoSchema, StartDuplicateScanSchema } from "../duplicate.schema";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

export const startDuplicateScanOperation: ZodOpenApiOperationObject = {
  operationId: "startDuplicateScan",
  summary: "Scan for duplicate records",
  description:
    "Starts a background scan of every contact in the workspace for likely duplicates. The scan compares name, name sound, email, email domain with surname, phone and organization with surname, and replaces the open groups of the previous scan when it finishes. Groups dismissed earlier do not come back. Requires read access to all contacts.",
  tags: ["duplicates"],
  security: [{ apiKeyAuth: [] }],
  requestBody: { required: true, content: { "application/json": { schema: StartDuplicateScanSchema } } },
  responses: {
    "201": {
      description: "The scan was started. Poll the duplicate groups to see its status.",
      content: { "application/json": { schema: DuplicateScanDtoSchema } },
    },
    "409": {
      description: "A scan of this record type is already running.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
  },
};
