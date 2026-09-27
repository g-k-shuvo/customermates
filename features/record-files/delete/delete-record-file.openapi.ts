import type { ZodOpenApiOperationObject } from "zod-openapi";

import { DeleteRecordFileResultSchema, RecordFileIdSchema } from "../record-file.schema";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

export const deleteRecordFileOperation: ZodOpenApiOperationObject = {
  operationId: "deleteRecordFile",
  summary: "Delete a file",
  description:
    "Removes the file from its record and deletes the stored object. Requires update permission on the record.",
  tags: ["files"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: RecordFileIdSchema },
  responses: {
    "200": {
      description: "The file was deleted.",
      content: { "application/json": { schema: DeleteRecordFileResultSchema } },
    },
    "404": {
      description: "No file with this ID exists, or the caller cannot see its record.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    "422": {
      description: "File storage is unreachable, so the object could not be deleted.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
  },
};
