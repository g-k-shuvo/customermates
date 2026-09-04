import type { ZodOpenApiOperationObject } from "zod-openapi";

import { PipelineDtoSchema } from "../pipeline.schema";

import { GetPipelineByIdSchema } from "./get-pipeline-by-id.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getPipelineByIdOperation: ZodOpenApiOperationObject = {
  operationId: "getPipelineById",
  summary: "Get a pipeline by ID",
  description: "Retrieves a single pipeline by its unique identifier, with its stages ordered by position.",
  tags: ["pipelines"],
  security: [{ apiKeyAuth: [] }],
  requestParams: {
    path: GetPipelineByIdSchema,
  },
  responses: {
    "200": {
      description: "The pipeline was retrieved successfully.",
      content: {
        "application/json": {
          schema: PipelineDtoSchema.nullable(),
        },
      },
    },
    ...CommonApiResponses,
  },
};
