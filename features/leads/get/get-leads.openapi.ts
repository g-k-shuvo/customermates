import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { LeadDtoSchema } from "../lead.schema";

import { GetQueryParamsApiSchema, GetResultSchema } from "@/core/base/base-get.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getLeadsOperation: ZodOpenApiOperationObject = {
  operationId: "getLeads",
  summary: "Get leads",
  description: "Retrieves a list of leads with optional filtering, sorting, and pagination.",
  tags: ["leads"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: GetQueryParamsApiSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "The leads were retrieved successfully.",
      content: {
        "application/json": {
          schema: GetResultSchema.extend({
            items: z.array(LeadDtoSchema),
          }),
        },
      },
    },
    ...CommonApiResponses,
  },
};
