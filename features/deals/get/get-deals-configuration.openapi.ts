import type { ZodOpenApiOperationObject } from "zod-openapi";

import { DealsConfigurationSchema } from "../deal.schema";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getDealsConfigurationOperation: ZodOpenApiOperationObject = {
  operationId: "getDealConfiguration",
  summary: "Get deals configuration",
  description:
    "Retrieves configuration for deals API, including available custom columns, filterable fields, sortable fields, and the company's pipelines with their stages.",
  tags: ["deals"],
  security: [{ apiKeyAuth: [] }],
  responses: {
    "200": {
      description: "The deals configuration was retrieved successfully.",
      content: {
        "application/json": {
          schema: DealsConfigurationSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
