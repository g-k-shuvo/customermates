import type { ZodOpenApiOperationObject } from "zod-openapi";

import { LeadDtoSchema } from "../lead.schema";

import { CreateLeadSchema } from "./create-lead.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const createLeadOperation: ZodOpenApiOperationObject = {
  operationId: "createLead",
  summary: "Create a lead",
  description: "Creates a new lead. Title is required. All other fields are optional.",
  tags: ["leads"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: CreateLeadSchema,
      },
    },
  },
  responses: {
    "201": {
      description: "The lead was created successfully.",
      content: {
        "application/json": {
          schema: LeadDtoSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
