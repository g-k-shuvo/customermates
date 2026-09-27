import type { ZodOpenApiOperationObject } from "zod-openapi";

import { RecordDocumentDtoSchema, RecordDocumentIdSchema } from "../record-document.schema";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

export const refreshSignatureOperation: ZodOpenApiOperationObject = {
  operationId: "refreshRecordDocumentSignature",
  summary: "Refresh a signature request from DocuSign",
  description:
    "Reads the envelope's current status and signers from DocuSign and applies them, exactly as a DocuSign callback would: a completed envelope stores the executed PDF. Use it when callbacks cannot reach this installation. Requires update permission on the record.",
  tags: ["documents"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: RecordDocumentIdSchema },
  requestBody: {
    required: false,
    description: "This action takes no request body; the document is identified by the path.",
    content: {},
  },
  responses: {
    "200": {
      description: "The document now reflects the envelope's status.",
      content: { "application/json": { schema: RecordDocumentDtoSchema } },
    },
    "404": {
      description: "No document with this ID exists, or the caller cannot see its record.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    "409": {
      description: "The document has never been sent for signature.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    "422": {
      description: "E-signature or file storage is not configured, or a service is unreachable.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
  },
};
