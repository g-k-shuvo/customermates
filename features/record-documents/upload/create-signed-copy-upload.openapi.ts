import type { ZodOpenApiOperationObject } from "zod-openapi";

import { RecordDocumentPdfSchema, RecordDocumentUploadDtoSchema } from "../record-document.schema";

import { CreateSignedCopyUploadSchema } from "./create-signed-copy-upload.interactor";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

export const createSignedCopyUploadOperation: ZodOpenApiOperationObject = {
  operationId: "createRecordDocumentSignedCopy",
  summary: "Attach the executed copy of a document",
  description:
    "Returns a presigned URL for the executed (signed) PDF of a document. PUT the bytes to `upload.url` with `upload.headers`, then call `POST /v1/documents/{id}/files/{fileId}/complete`. Completing it marks the document `completed` and replaces any earlier signed copy; the PDF as uploaded is kept. Only PDF files are accepted. Requires update permission on the record.",
  tags: ["documents"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: CreateSignedCopyUploadSchema.pick({ id: true }) },
  requestBody: {
    required: true,
    content: { "application/json": { schema: RecordDocumentPdfSchema } },
  },
  responses: {
    "201": {
      description: "A presigned upload URL for the signed copy was issued.",
      content: { "application/json": { schema: RecordDocumentUploadDtoSchema } },
    },
    "404": {
      description: "No document with this ID exists, or the caller cannot see its record.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    "422": {
      description: "File storage is not configured on this installation, or it is unreachable.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
  },
};
