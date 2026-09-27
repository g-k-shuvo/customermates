import type { ZodOpenApiOperationObject } from "zod-openapi";

import { SignatureSuggestionsDtoSchema } from "./record-document-signing.schema";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";
import { RecordFileTargetSchema } from "@/features/record-files/record-file.schema";

export const getSignatureSuggestionsOperation: ZodOpenApiOperationObject = {
  operationId: "getRecordDocumentSignatureSuggestions",
  summary: "Suggest signers for a record's documents",
  description:
    "Lists people with an email address who belong to the record: the contact itself, the contacts of a deal, or the contacts of an organization. Up to 10 are returned.",
  tags: ["documents"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { query: RecordFileTargetSchema },
  responses: {
    "200": {
      description: "The suggestions were retrieved.",
      content: { "application/json": { schema: SignatureSuggestionsDtoSchema } },
    },
    "404": {
      description: "The record does not exist or the caller cannot see it.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
  },
};
