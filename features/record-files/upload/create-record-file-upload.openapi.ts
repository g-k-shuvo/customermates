import type { ZodOpenApiOperationObject } from "zod-openapi";

import { RecordFileUploadDtoSchema } from "../record-file.schema";

import { CreateRecordFileUploadSchema } from "./create-record-file-upload.interactor";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

export const createRecordFileUploadOperation: ZodOpenApiOperationObject = {
  operationId: "createRecordFileUpload",
  summary: "Start a file upload on a record",
  description:
    "Registers a file for a contact, organization or deal and returns a presigned URL. PUT the file's bytes to `upload.url` with `upload.headers` (the `Content-Type` and the exact `Content-Length` are signed) before `upload.expiresAt`, then call `POST /v1/files/{id}/complete`. Until then the file is pending and not listed; a pending file that is never completed is removed after 24 hours. The name, type and size are checked first: the extension must be on the allowlist and agree with the content type, active content (HTML, SVG, XML, scripts, executables) is refused, and the size may not exceed the installation's limit. Requires update permission on the record.",
  tags: ["files"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: CreateRecordFileUploadSchema,
      },
    },
  },
  responses: {
    "201": {
      description: "The file was registered and a presigned upload URL was issued.",
      content: { "application/json": { schema: RecordFileUploadDtoSchema } },
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
