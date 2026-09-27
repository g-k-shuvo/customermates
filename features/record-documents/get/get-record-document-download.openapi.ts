import type { ZodOpenApiOperationObject } from "zod-openapi";

import { GetRecordDocumentDownloadSchema } from "./get-record-document-download.interactor";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";
import { RecordFileDownloadDtoSchema } from "@/features/record-files/record-file.schema";

export const getRecordDocumentDownloadOperation: ZodOpenApiOperationObject = {
  operationId: "getRecordDocumentDownload",
  summary: "Get a link to a document's PDF",
  description:
    "Returns a presigned URL for one of the document's PDFs, valid until `expiresAt` and served for viewing in the browser. Without `version` it is the signed copy when there is one, otherwise the PDF as uploaded; `version=original` or `version=signed` picks one.",
  tags: ["documents"],
  security: [{ apiKeyAuth: [] }],
  requestParams: {
    path: GetRecordDocumentDownloadSchema.pick({ id: true }),
    query: GetRecordDocumentDownloadSchema.pick({ version: true }),
  },
  responses: {
    "200": {
      description: "A link was issued.",
      content: { "application/json": { schema: RecordFileDownloadDtoSchema } },
    },
    "404": {
      description:
        "No document with this ID exists, the caller cannot see its record, or it has no PDF of the requested version.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    "422": {
      description: "File storage is not configured on this installation, or it is unreachable.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
  },
};
