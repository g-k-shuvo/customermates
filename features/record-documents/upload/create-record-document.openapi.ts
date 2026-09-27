import type { ZodOpenApiOperationObject } from "zod-openapi";

import { RecordDocumentUploadDtoSchema } from "../record-document.schema";

import { CreateRecordDocumentSchema } from "./create-record-document.interactor";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

export const createRecordDocumentOperation: ZodOpenApiOperationObject = {
  operationId: "createRecordDocument",
  summary: "Add a document to a record",
  description:
    "Registers a document on a contact, organization or deal and returns a presigned URL for its PDF. PUT the PDF's bytes to `upload.url` with `upload.headers` (the `Content-Type` and the exact `Content-Length` are signed) before `upload.expiresAt`, then call `POST /v1/documents/{id}/files/{fileId}/complete` with `document.id` and `file.id`. Until then the document is not listed; one that is never completed is removed after 24 hours. Only PDF files are accepted, up to the installation's size limit. The title defaults to the file name without `.pdf`, and the status to `draft`. Requires update permission on the record.",
  tags: ["documents"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    required: true,
    content: { "application/json": { schema: CreateRecordDocumentSchema } },
  },
  responses: {
    "201": {
      description: "The document was registered and a presigned upload URL was issued.",
      content: { "application/json": { schema: RecordDocumentUploadDtoSchema } },
    },
    "404": {
      description: "The record does not exist or the caller cannot see it.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    "422": {
      description: "File storage is not configured on this installation, or it is unreachable.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
  },
};
