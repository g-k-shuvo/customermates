import type { ZodOpenApiOperationObject } from "zod-openapi";

import { RecordFileDtoSchema, RecordFileIdSchema } from "../record-file.schema";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

export const completeRecordFileUploadOperation: ZodOpenApiOperationObject = {
  operationId: "completeRecordFileUpload",
  summary: "Finish a file upload",
  description:
    "Checks that the uploaded object exists with the size and type that were registered, and lists the file on its record. When the object is still missing nothing changes, so the call can be repeated once the upload has finished. When it has the wrong size or type, the object and the file entry are both removed.",
  tags: ["files"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: RecordFileIdSchema },
  requestBody: {
    required: false,
    description: "This action takes no request body; the file is identified by the path.",
    content: {},
  },
  responses: {
    "200": {
      description: "The upload was verified and the file is now listed on its record.",
      content: { "application/json": { schema: RecordFileDtoSchema } },
    },
    "404": {
      description: "No pending file with this ID exists, or the caller cannot see its record.",
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
