import type { ZodOpenApiOperationObject } from "zod-openapi";

import { WebFormSourceWithSecretSchema } from "../webform-source.schema";

import { RotateWebFormSecretSchema } from "./rotate-web-form-secret.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const rotateWebFormSecretOperation: ZodOpenApiOperationObject = {
  operationId: "rotateWebFormSecret",
  summary: "Rotate a web form signing secret",
  description:
    "Issues a new signing secret and invalidates the previous one. Deliveries signed with the old secret are rejected from the moment this returns, so update the sending site before rotating.",
  tags: ["webform-sources"],
  security: [{ apiKeyAuth: [] }],
  requestParams: {
    path: RotateWebFormSecretSchema,
  },
  responses: {
    "200": {
      description: "The secret was rotated successfully.",
      content: {
        "application/json": {
          schema: WebFormSourceWithSecretSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
