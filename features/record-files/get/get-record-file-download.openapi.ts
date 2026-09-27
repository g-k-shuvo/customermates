import type { ZodOpenApiOperationObject } from "zod-openapi";

import { RecordFileDownloadDtoSchema, RecordFileIdSchema } from "../record-file.schema";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

export const getRecordFileDownloadOperation: ZodOpenApiOperationObject = {
  operationId: "getRecordFileDownload",
  summary: "Get a download link for a file",
  description:
    "Returns a presigned URL for the file's bytes, valid until `expiresAt`. PDFs and common images are served for viewing in the browser; every other type is served as a download under its original name.",
  tags: ["files"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: RecordFileIdSchema },
  responses: {
    "200": {
      description: "A download link was issued.",
      content: { "application/json": { schema: RecordFileDownloadDtoSchema } },
    },
    "404": {
      description: "No completed file with this ID exists, or the caller cannot see its record.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    "422": {
      description: "File storage is not configured on this installation, or it is unreachable.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
  },
};
