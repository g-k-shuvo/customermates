import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { LeadDtoSchema } from "../lead.schema";

import { BaseUpdateLeadSchema } from "./update-lead-base.schema";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const updateLeadOperation: ZodOpenApiOperationObject = {
  operationId: "updateLead",
  summary: "Update a lead",
  description:
    "Updates an existing lead. Only the supplied fields are changed. Set contactId, organizationId, ownerUserId, sourceId or value to null to clear it.",
  tags: ["leads"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: z.object({ id: z.uuid() }) },
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: BaseUpdateLeadSchema.omit({ id: true }),
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
