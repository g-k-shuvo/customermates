import type { ZodOpenApiOperationObject } from "zod-openapi";

import { LeadDtoSchema } from "../lead.schema";

import { UpdateLeadSchema } from "./update-lead.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const updateLeadOperation: ZodOpenApiOperationObject = {
  operationId: "updateLead",
  summary: "Update a lead",
  description: "Updates an existing lead. Only the supplied fields are changed.",
  tags: ["leads"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: UpdateLeadSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "The lead was updated successfully.",
      content: {
        "application/json": {
          schema: LeadDtoSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
