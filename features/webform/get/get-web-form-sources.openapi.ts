import type { ZodOpenApiOperationObject } from "zod-openapi";

import { WebFormSourceListSchema } from "../webform-source.schema";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getWebFormSourcesOperation: ZodOpenApiOperationObject = {
  operationId: "getWebFormSources",
  summary: "List web form sources",
  description: "Returns every web form source in the company. Signing secrets are not included.",
  tags: ["webform-sources"],
  security: [{ apiKeyAuth: [] }],
  responses: {
    "200": {
      description: "The sources were retrieved successfully.",
      content: {
        "application/json": {
          schema: WebFormSourceListSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
