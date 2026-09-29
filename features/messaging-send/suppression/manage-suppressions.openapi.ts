import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import {
  AddSuppressionSchema,
  GetSuppressionsSchema,
  SuppressionDtoSchema,
  SuppressionIdSchema,
  SuppressionListDtoSchema,
} from "./manage-suppressions.interactor";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

export const getSuppressionsOperation: ZodOpenApiOperationObject = {
  operationId: "getSuppressions",
  summary: "List suppressed addresses",
  description:
    "Lists addresses that receive no marketing mail, newest first, 50 per page, optionally filtered by `search`. `reason` is `unsubscribed` (the recipient used the unsubscribe link or the mail client's one-click button), `bounced`, `complained` or `manual`. Transactional mail is never held back. Requires read access to the company.",
  tags: ["suppressions"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { query: GetSuppressionsSchema },
  responses: {
    "200": {
      description: "The suppressions were retrieved.",
      content: { "application/json": { schema: SuppressionListDtoSchema } },
    },
    ...CommonApiResponses,
  },
};

export const addSuppressionOperation: ZodOpenApiOperationObject = {
  operationId: "addSuppression",
  summary: "Suppress an address",
  description:
    "Adds an address with reason `manual`, so marketing mail is no longer sent to it. Adding an address that is already suppressed returns the existing entry. Requires permission to update the company.",
  tags: ["suppressions"],
  security: [{ apiKeyAuth: [] }],
  requestBody: { required: true, content: { "application/json": { schema: AddSuppressionSchema } } },
  responses: {
    "201": {
      description: "The address is suppressed.",
      content: { "application/json": { schema: SuppressionDtoSchema } },
    },
    ...CommonApiResponses,
  },
};

export const removeSuppressionOperation: ZodOpenApiOperationObject = {
  operationId: "removeSuppression",
  summary: "Lift a suppression",
  description:
    "Removes an address from the suppression list; marketing mail can reach it again. Requires permission to update the company.",
  tags: ["suppressions"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: SuppressionIdSchema },
  responses: {
    "200": {
      description: "The suppression was removed.",
      content: { "application/json": { schema: z.object({ id: z.uuid() }) } },
    },
    "404": {
      description: "No suppression with this ID exists.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
  },
};
