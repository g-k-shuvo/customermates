import type { ZodOpenApiOperationObject } from "zod-openapi";

import { RecordDocumentDtoSchema } from "../record-document.schema";

import { SendForSignatureSchema } from "./record-document-signing.schema";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

export const sendForSignatureOperation: ZodOpenApiOperationObject = {
  operationId: "sendRecordDocumentForSignature",
  summary: "Send a document for signature",
  description:
    "Sends the document's PDF, as uploaded, to DocuSign and emails every signer a link to sign it. The document moves to `sent` and its `signature` shows each signer's progress. DocuSign reports back through `POST /api/webhooks/docusign`: a completed envelope stores the executed PDF as the document's signed copy and marks it `completed`, a declined or voided one sets that status. While a request is out, the status cannot be changed by hand. Only a `draft`, `declined` or `voided` document can be sent. The subject defaults to the title. Requires update permission on the record.",
  tags: ["documents"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: SendForSignatureSchema.pick({ id: true }) },
  requestBody: {
    required: true,
    content: { "application/json": { schema: SendForSignatureSchema.omit({ id: true }) } },
  },
  responses: {
    "200": {
      description: "DocuSign accepted the envelope and the signers were emailed.",
      content: { "application/json": { schema: RecordDocumentDtoSchema } },
    },
    "404": {
      description: "No document with this ID exists, or the caller cannot see its record.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    "409": {
      description: "The document is already out for signature, or its status does not allow sending it.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    "422": {
      description:
        "E-signature or file storage is not configured, DocuSign has not been granted consent, or a service is unreachable.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
  },
};
