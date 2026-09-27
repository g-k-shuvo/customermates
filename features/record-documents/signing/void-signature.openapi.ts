import type { ZodOpenApiOperationObject } from "zod-openapi";

import { RecordDocumentDtoSchema } from "../record-document.schema";

import { VoidSignatureSchema } from "./record-document-signing.schema";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

export const voidSignatureOperation: ZodOpenApiOperationObject = {
  operationId: "voidRecordDocumentSignature",
  summary: "Cancel a signature request",
  description:
    "Voids the document's DocuSign envelope, so its signers can no longer sign, and marks the document `voided`. DocuSign shows the reason to the signers; without one a standard sentence is used. Requires update permission on the record.",
  tags: ["documents"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: VoidSignatureSchema.pick({ id: true }) },
  requestBody: {
    required: true,
    content: { "application/json": { schema: VoidSignatureSchema.omit({ id: true }) } },
  },
  responses: {
    "200": {
      description: "The envelope was voided.",
      content: { "application/json": { schema: RecordDocumentDtoSchema } },
    },
    "404": {
      description: "No document with this ID exists, or the caller cannot see its record.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    "409": {
      description: "The document is not out for signature.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    "422": {
      description: "E-signature is not configured, or DocuSign is unreachable.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
  },
};
