import type { ZodOpenApiOperationObject } from "zod-openapi";

import { RecordDocumentListDtoSchema } from "../record-document.schema";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";
import { RecordFileTargetSchema } from "@/features/record-files/record-file.schema";

export const getRecordDocumentsOperation: ZodOpenApiOperationObject = {
  operationId: "getRecordDocuments",
  summary: "List a record's documents",
  description:
    "Lists the documents of a contact, organization or deal, newest first. Each document has a title, a status (`draft`, `sent`, `completed`, `declined` or `voided`) with the time it last changed, the PDF as uploaded in `original`, and the executed PDF in `signed` once there is one. `storageConfigured` says whether this installation can store documents at all, and `maxUploadBytes` is the largest PDF it accepts.",
  tags: ["documents"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { query: RecordFileTargetSchema },
  responses: {
    "200": {
      description: "The record's documents were retrieved.",
      content: { "application/json": { schema: RecordDocumentListDtoSchema } },
    },
    "404": {
      description: "The record does not exist or the caller cannot see it.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
  },
};
