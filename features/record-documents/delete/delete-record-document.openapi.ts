import type { ZodOpenApiOperationObject } from "zod-openapi";

import { DeleteRecordDocumentResultSchema, RecordDocumentIdSchema } from "../record-document.schema";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

export const deleteRecordDocumentOperation: ZodOpenApiOperationObject = {
  operationId: "deleteRecordDocument",
  summary: "Delete a document",
  description:
    "Removes the document from its record and deletes its stored PDFs, the signed copy included. Requires update permission on the record.",
  tags: ["documents"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: RecordDocumentIdSchema },
  responses: {
    "200": {
      description: "The document was deleted.",
      content: { "application/json": { schema: DeleteRecordDocumentResultSchema } },
    },
    "404": {
      description: "No document with this ID exists, or the caller cannot see its record.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    "422": {
      description: "File storage is unreachable, so the PDFs could not be deleted.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
  },
};
