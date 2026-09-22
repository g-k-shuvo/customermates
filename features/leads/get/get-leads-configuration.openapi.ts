import type { ZodOpenApiOperationObject } from "zod-openapi";

import { GetConfigurationSchema } from "@/core/base/base-get.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getLeadsConfigurationOperation: ZodOpenApiOperationObject = {
  operationId: "getLeadConfiguration",
  summary: "Get leads configuration",
  description:
    "Retrieves configuration for the leads API, including available custom columns, filterable fields, and sortable fields.",
  tags: ["leads"],
  security: [{ apiKeyAuth: [] }],
  responses: {
    "200": {
      description: "The leads configuration was retrieved successfully.",
      content: {
        "application/json": {
          schema: GetConfigurationSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
