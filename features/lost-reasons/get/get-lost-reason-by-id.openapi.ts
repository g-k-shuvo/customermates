import type { ZodOpenApiOperationObject } from "zod-openapi";

import { LostReasonDtoSchema } from "../lost-reason.schema";

import { GetLostReasonByIdSchema } from "./get-lost-reason-by-id.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getLostReasonByIdOperation: ZodOpenApiOperationObject = {
  operationId: "getLostReasonById",
  summary: "Get a lost reason by ID",
  description: "Retrieves a single lost reason by its unique identifier.",
  tags: ["lost-reasons"],
  security: [{ apiKeyAuth: [] }],
  requestParams: {
    path: GetLostReasonByIdSchema,
  },
  responses: {
    "200": {
      description: "The lost reason was retrieved successfully.",
      content: {
        "application/json": {
          schema: LostReasonDtoSchema.nullable(),
        },
      },
    },
    ...CommonApiResponses,
  },
};
