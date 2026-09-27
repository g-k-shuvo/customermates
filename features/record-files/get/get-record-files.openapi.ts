import type { ZodOpenApiOperationObject } from "zod-openapi";

import { RecordFileListDtoSchema, RecordFileTargetSchema } from "../record-file.schema";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

export const getRecordFilesOperation: ZodOpenApiOperationObject = {
  operationId: "getRecordFiles",
  summary: "List a record's files",
  description:
    "Lists the completed files of a contact, organization or deal, newest first. `storageConfigured` says whether this installation can store files at all, and `maxUploadBytes` is the largest upload it accepts.",
  tags: ["files"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { query: RecordFileTargetSchema },
  responses: {
    "200": {
      description: "The record's files were retrieved.",
      content: { "application/json": { schema: RecordFileListDtoSchema } },
    },
    "404": {
      description: "The record does not exist or the caller cannot see it.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
  },
};
