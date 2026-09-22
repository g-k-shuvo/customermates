import type { ZodOpenApiOperationObject } from "zod-openapi";

import { LeadDtoSchema } from "../lead.schema";

import { UpdateManyLeadsSchema } from "./update-many-leads.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const updateManyLeadsOperation: ZodOpenApiOperationObject = {
  operationId: "updateManyLeads",
  summary: "Update many leads",
  description:
    "Updates many leads in a single request. Each entry requires an id; every other field is optional and only the fields present are changed.",
  tags: ["leads"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: UpdateManyLeadsSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "The leads were updated successfully.",
      content: {
        "application/json": {
          schema: LeadDtoSchema.array(),
        },
      },
    },
    ...CommonApiResponses,
  },
};
