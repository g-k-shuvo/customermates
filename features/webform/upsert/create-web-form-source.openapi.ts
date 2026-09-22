import type { ZodOpenApiOperationObject } from "zod-openapi";

import { WebFormSourceWithSecretSchema } from "../webform-source.schema";

import { CreateWebFormSourceSchema } from "./create-web-form-source.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const createWebFormSourceOperation: ZodOpenApiOperationObject = {
  operationId: "createWebFormSource",
  summary: "Create a web form source",
  description:
    "Registers a form that may deliver leads. The response carries the signing secret once; it is never returned again, so store it where the sending site can reach it.",
  tags: ["webform-sources"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: CreateWebFormSourceSchema,
      },
    },
  },
  responses: {
    "201": {
      description: "The source was created successfully.",
      content: {
        "application/json": {
          schema: WebFormSourceWithSecretSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
