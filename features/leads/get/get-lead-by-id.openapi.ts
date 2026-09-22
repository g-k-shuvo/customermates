import type { ZodOpenApiOperationObject } from "zod-openapi";

import { LeadDtoSchema } from "../lead.schema";

import { GetLeadByIdSchema } from "./get-lead-by-id.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getLeadByIdOperation: ZodOpenApiOperationObject = {
  operationId: "getLeadById",
  summary: "Get a lead by ID",
  description: "Retrieves a single lead by its unique identifier.",
  tags: ["leads"],
  security: [{ apiKeyAuth: [] }],
  requestParams: {
    path: GetLeadByIdSchema,
  },
  responses: {
    "200": {
      description: "The lead was retrieved successfully.",
      content: {
        "application/json": {
          schema: LeadDtoSchema.nullable(),
        },
      },
    },
    ...CommonApiResponses,
  },
};
