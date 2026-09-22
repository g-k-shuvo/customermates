import type { ZodOpenApiOperationObject } from "zod-openapi";

import { WebFormSourceDtoSchema } from "../webform-source.schema";

import { GetWebFormSourceByIdSchema } from "./get-web-form-source-by-id.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getWebFormSourceByIdOperation: ZodOpenApiOperationObject = {
  operationId: "getWebFormSourceById",
  summary: "Get a web form source by ID",
  description: "Returns a single web form source. The signing secret is not included.",
  tags: ["webform-sources"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: GetWebFormSourceByIdSchema },
  responses: {
    "200": {
      description: "The source was retrieved successfully.",
      content: {
        "application/json": {
          schema: WebFormSourceDtoSchema.nullable(),
        },
      },
    },
    ...CommonApiResponses,
  },
};
