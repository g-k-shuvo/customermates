import type { ZodOpenApiOperationObject } from "zod-openapi";

import { RecordDocumentDtoSchema, RecordDocumentFileIdSchema } from "../record-document.schema";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

export const completeRecordDocumentFileOperation: ZodOpenApiOperationObject = {
  operationId: "completeRecordDocumentFile",
  summary: "Finish a document upload",
  description:
    "Checks that the uploaded PDF exists with the registered size, then lists it: a new document appears on its record, and a signed copy marks the document `completed`. When the object is still missing nothing changes, so the call can be repeated once the upload has finished. When it has the wrong size or type the object is removed, together with the file entry, and with the document too when this was its first PDF.",
  tags: ["documents"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: RecordDocumentFileIdSchema },
  requestBody: {
    required: false,
    description: "This action takes no request body; the document and file are identified by the path.",
    content: {},
  },
  responses: {
    "200": {
      description: "The upload was verified and the document was updated.",
      content: { "application/json": { schema: RecordDocumentDtoSchema } },
    },
    "404": {
      description: "No pending file with this ID exists on the document, or the caller cannot see its record.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    "409": {
      description: "The object is missing, or it does not match the registered size and type.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    "422": {
      description: "File storage is not configured on this installation, or it is unreachable.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
  },
};
