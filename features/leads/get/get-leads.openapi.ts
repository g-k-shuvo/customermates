import type { ZodOpenApiOperationObject } from "zod-openapi";

import { LeadListResponseSchema } from "../lead.schema";

import { GetLeadsSchema } from "./get-leads.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getLeadsOperation: ZodOpenApiOperationObject = {
  operationId: "getLeads",
  summary: "Search leads",
  description: "Returns leads the caller may read, optionally filtered by status, owner or source.",
  tags: ["leads"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: GetLeadsSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "The leads were retrieved successfully.",
      content: {
        "application/json": {
          schema: LeadListResponseSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
