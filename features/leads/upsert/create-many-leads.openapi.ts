import type { ZodOpenApiOperationObject } from "zod-openapi";

import { LeadDtoSchema } from "../lead.schema";

import { CreateManyLeadsSchema } from "./create-many-leads.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const createManyLeadsOperation: ZodOpenApiOperationObject = {
  operationId: "createManyLeads",
  summary: "Create many leads",
  description:
    "Creates many leads in a single request. Each lead requires a title. All other fields are optional and a lead with no status is created as new.",
  tags: ["leads"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: CreateManyLeadsSchema,
      },
    },
  },
  responses: {
    "201": {
      description: "The leads were created successfully.",
      content: {
        "application/json": {
          schema: LeadDtoSchema.array(),
        },
      },
    },
    ...CommonApiResponses,
  },
};
