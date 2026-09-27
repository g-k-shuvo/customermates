import type { ZodOpenApiOperationObject } from "zod-openapi";

import { RecordDocumentDtoSchema } from "../record-document.schema";

import { UpdateRecordDocumentSchema } from "./update-record-document.interactor";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

export const updateRecordDocumentOperation: ZodOpenApiOperationObject = {
  operationId: "updateRecordDocument",
  summary: "Rename a document or change its status",
  description:
    "Updates the title, the status, or both. Only provided fields change; a status change also moves `statusChangedAt`. Requires update permission on the record.",
  tags: ["documents"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: UpdateRecordDocumentSchema.pick({ id: true }) },
  requestBody: {
    required: true,
    content: { "application/json": { schema: UpdateRecordDocumentSchema.omit({ id: true }) } },
  },
  responses: {
    "200": {
      description: "The document was updated.",
      content: { "application/json": { schema: RecordDocumentDtoSchema } },
    },
    "404": {
      description: "No document with this ID exists, or the caller cannot see its record.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
  },
};
