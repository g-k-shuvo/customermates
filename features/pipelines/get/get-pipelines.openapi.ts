import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { PipelineDtoSchema } from "../pipeline.schema";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getPipelinesOperation: ZodOpenApiOperationObject = {
  operationId: "getPipelines",
  summary: "Get pipelines",
  description: "Retrieves the company's pipelines, each with its stages ordered by position.",
  tags: ["pipelines"],
  security: [{ apiKeyAuth: [] }],
  responses: {
    "200": {
      description: "The pipelines were retrieved successfully.",
      content: {
        "application/json": {
          schema: z.array(PipelineDtoSchema),
        },
      },
    },
    ...CommonApiResponses,
  },
};
