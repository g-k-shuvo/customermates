import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { LostReasonDtoSchema } from "../lost-reason.schema";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getLostReasonsOperation: ZodOpenApiOperationObject = {
  operationId: "getLostReasons",
  summary: "Get lost reasons",
  description: "Retrieves the company's lost reasons, ordered by position.",
  tags: ["lost-reasons"],
  security: [{ apiKeyAuth: [] }],
  responses: {
    "200": {
      description: "The lost reasons were retrieved successfully.",
      content: {
        "application/json": {
          schema: z.array(LostReasonDtoSchema),
        },
      },
    },
    ...CommonApiResponses,
  },
};
